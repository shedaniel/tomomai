import { SongDetails, UniqueSong, UniqueSongDifficulty } from '@/components/db/songs/types';
import { db } from '@/lib/db';
import { scoreData, snapshotScores, songs, userSnapshots } from '@/lib/db/schema-pg';
import { VersionId } from '@/lib/metadata';
import { getSongSlug, getSongSlugs } from '@/lib/song-slug';
import { publicProcedure, router } from '@/lib/trpc';
import { Region, SongExtended } from '@/lib/types';
import { TRPCError } from '@trpc/server';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { unstable_cache } from 'next/cache';
import { Optional } from 'utility-types';
import { z } from 'zod';

export const songsRouter = router({
  getAllUniqueSongs: publicProcedure
    .query(async () => {
      const getCachedUniqueSongs = unstable_cache(
        async () => {
          const allSongs = await db
            .select({
              id: songs.id,
              songName: songs.songName,
              artist: songs.artist,
              cover: songs.cover,
              type: songs.type,
              genre: songs.genre,
              difficulty: songs.difficulty,
              levelPrecise: songs.levelPrecise,
              noteDesigner: songs.noteDesigner,
              addedVersion: songs.addedVersion,
              region: songs.region,
              gameVersion: songs.gameVersion,
            })
            .from(songs)
            .orderBy(songs.songName);

          const allSongsSortedById = [...allSongs].sort((a, b) => Number(a.id) - Number(b.id));
          const allSongsToSortedIndex = Object.fromEntries(allSongsSortedById.map((song, index) => [String(song.id), index]));
          const allSongsWithIndex = allSongs.map((song) => (
            { ...song, index: allSongsToSortedIndex[String(song.id)]! } satisfies Optional<typeof song, 'id'> & { index: number }
          ));

          const uniqueSongs: Map<string, typeof allSongsWithIndex[0] & {
            difficulties: (UniqueSongDifficulty & {
              region: Region;
              gameVersion: number;
            })[];
          }> = new Map();
          for (const song of allSongsWithIndex) {
            const key = `${song.songName}||${song.type}`;
            if (!uniqueSongs.has(key)) {
              uniqueSongs.set(key, {
                ...song,
                difficulties: [],
              });
            } else {
              uniqueSongs.set(key, {
                ...uniqueSongs.get(key)!,
                difficulties: [...uniqueSongs.get(key)!.difficulties],
                ...song,
              });
            }
            const existingDifficulty = uniqueSongs.get(key)!.difficulties.find(d => d.difficulty === song.difficulty);
            if (existingDifficulty) {
              if (existingDifficulty.gameVersion < song.gameVersion || (existingDifficulty.gameVersion === song.gameVersion && song.region === "jp" && existingDifficulty.region === "intl")) {
                uniqueSongs.get(key)!.difficulties.splice(uniqueSongs.get(key)!.difficulties.indexOf(existingDifficulty), 1);
              } else continue;
            }

            uniqueSongs.get(key)!.difficulties.push({
              difficulty: song.difficulty,
              levelPrecise: song.levelPrecise,
              region: song.region,
              gameVersion: song.gameVersion,
              noteDesigner: song.noteDesigner,
            });
          }

          const songsWithSlugs = await getSongSlugs(Array.from(uniqueSongs.values()));
          const songsStripped: UniqueSong[] = songsWithSlugs.map((song) => {
            return {
              index: song.index,
              songName: song.songName,
              artist: song.artist,
              cover: song.cover,
              type: song.type,
              genre: song.genre,
              addedVersion: song.addedVersion as VersionId,
              difficulties: song.difficulties.map(d => ({
                difficulty: d.difficulty,
                levelPrecise: d.levelPrecise,
                noteDesigner: d.noteDesigner,
              }) satisfies UniqueSongDifficulty),
              slug: song.slug,
              aliases: song.aliases,
            } satisfies UniqueSong;
          });
          return songsStripped;
        },
        ['all-unique-songs'],
        {
          revalidate: 3600,
          tags: ['all-unique-songs']
        }
      );

      return getCachedUniqueSongs();
    }),

  getSongDetails: publicProcedure
    .input(z.object({
      songName: z.string(),
      type: z.enum(['std', 'dx']),
    }))
    .query(async ({ input, ctx }) => {
      const chartsQuery = db
        .select({
          songId: songs.publicId,
          songName: songs.songName,
          artist: songs.artist,
          cover: songs.cover,
          difficulty: songs.difficulty,
          level: songs.level,
          levelPrecise: songs.levelPrecise,
          type: songs.type,
          genre: songs.genre,
          region: songs.region,
          gameVersion: songs.gameVersion,
          addedVersion: songs.addedVersion,
          bpm: songs.bpm,
          noteDesigner: songs.noteDesigner,
          tapCount: songs.tapCount,
          holdCount: songs.holdCount,
          slideCount: songs.slideCount,
          touchCount: songs.touchCount,
          breakCount: songs.breakCount,
        })
        .from(songs)
        .where(
          and(
            eq(songs.songName, input.songName),
            eq(songs.type, input.type)
          )
        )
        .orderBy(songs.region, desc(songs.gameVersion), songs.difficulty);

      let scoresQuery: Promise<{ region: string; difficulty: string; achievement: number; fc: string; fs: string }[]> = Promise.resolve([]);

      if (ctx.session?.user?.id) {
        const userId = ctx.session.user.id;

        scoresQuery = db
          .select({
            region: songs.region,
            difficulty: songs.difficulty,
            achievement: scoreData.achievement,
            fc: scoreData.fc,
            fs: scoreData.fs,
          })
          .from(snapshotScores)
          .innerJoin(scoreData, eq(snapshotScores.scoreId, scoreData.id))
          .innerJoin(songs, eq(scoreData.songId, songs.id))
          .where(
            and(
              eq(songs.songName, input.songName),
              eq(songs.type, input.type),
              inArray(
                snapshotScores.snapshotId,
                db.selectDistinctOn([userSnapshots.region], { id: userSnapshots.id })
                  .from(userSnapshots)
                  .where(eq(userSnapshots.userId, userId))
                  .orderBy(userSnapshots.region, desc(userSnapshots.fetchedAt))
              )
            )
          );
      }

      const [charts, scores] = await Promise.all([chartsQuery, scoresQuery]);

      if (charts.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Song not found',
        });
      }

      let userScoresMap: Record<string, Record<string, { achievement: number; fc: string; fs: string }>> | undefined;
      if (scores.length > 0) {
        userScoresMap = {};
        for (const score of scores) {
          if (!userScoresMap[score.region]) {
            userScoresMap[score.region] = {};
          }
          userScoresMap[score.region][score.difficulty] = {
            achievement: score.achievement,
            fc: score.fc,
            fs: score.fs
          };
        }
      }

      const byRegion = new Map<Region, Map<VersionId, SongExtended[]>>();
      for (const chart of charts) {
        if (!byRegion.has(chart.region)) {
          byRegion.set(chart.region, new Map());
        }
        const chartVersion = chart.gameVersion as VersionId;
        const regionMap = byRegion.get(chart.region)!;
        if (!regionMap.has(chartVersion)) {
          regionMap.set(chartVersion, []);
        }
        regionMap.get(chartVersion)!.push({
          ...chart,
          addedVersion: chart.addedVersion as VersionId,
        });
      }

      const regions = Array.from(byRegion.entries()).map(([region, versionMap]) => ({
        region,
        versions: Array.from(versionMap.entries()).map(([version, vCharts]) => ({
          gameVersion: version,
          charts: vCharts,
        })).sort((a, b) => b.gameVersion - a.gameVersion),
      }));

      const firstChart = charts[0];
      const chartWithBpm = charts.find(c => c.bpm !== null);
      const earliestAddedVersion = Math.min(...charts.map(c => c.addedVersion));

      return {
        songName: firstChart.songName,
        artist: firstChart.artist,
        cover: firstChart.cover,
        type: firstChart.type,
        genre: firstChart.genre,
        bpm: chartWithBpm?.bpm ?? null,
        addedVersion: earliestAddedVersion as VersionId,
        userScores: userScoresMap,
        regions,
      } satisfies SongDetails;
    }),

  getSimpleSongDetails: publicProcedure
    .input(z.object({
      publicId: z.string(),
    }))
    .query(async ({ input }) => {
      const charts = await db
        .select({
          songName: songs.songName,
          artist: songs.artist,
          type: songs.type,
          genre: songs.genre,
          bpm: songs.bpm,
          addedVersion: songs.addedVersion,
        })
        .from(songs)
        .where(eq(songs.publicId, input.publicId));

      if (charts.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Song not found',
        });
      }

      const firstChart = charts[0];
      const chartWithBpm = charts.find(c => c.bpm !== null);
      const earliestAddedVersion = Math.min(...charts.map(c => c.addedVersion)) as VersionId;

      const slug = await getSongSlug({
        songName: firstChart.songName,
        artist: firstChart.artist,
        type: firstChart.type,
      });

      return {
        songName: firstChart.songName,
        artist: firstChart.artist,
        type: firstChart.type,
        genre: firstChart.genre,
        bpm: chartWithBpm?.bpm ?? null,
        addedVersion: earliestAddedVersion,
        slug,
      };
    }),
});
