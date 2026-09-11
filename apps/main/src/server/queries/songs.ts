import { songInstanceId } from "@/lib/db/song-instance-id";
import { SongDetailChart, SongDetailHistoricalChart, SongDetails } from "@/components/db/songs/types";
import { db } from "@/lib/db";
import { parentSong, scoreData, snapshotScores, songs, userSnapshots } from "@/lib/db/schema-pg";
import { VersionId } from "@/lib/metadata";
import { getSongSlugs } from "@/lib/song-slug";
import { Region, SongType } from "@/lib/types";
import { maxBy } from "@/lib/utils";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { Optional } from "utility-types";
import { DIFFICULTY_ENUM } from "@/lib/db/types";
import { UniqueSong, UniqueSongDifficulty } from "@/components/db/songs/types";

export async function querySongScores(
  songName: string,
  type: SongType,
  userId: string,
  artist?: string
): Promise<SongDetails["userScores"]> {
  if (artist === undefined) {
    const artists = await db.selectDistinct({ artist: parentSong.artist })
      .from(parentSong)
      .innerJoin(songs, eq(songs.parentId, parentSong.id))
      .where(and(eq(parentSong.songName, songName), eq(parentSong.type, type)))
      .limit(2);
    if (artists.length > 1) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Artist is required for songs with the same name" });
    }
  }

  const scores = await db
    .select({
      region: songs.region,
      artist: parentSong.artist,
      difficulty: parentSong.difficulty,
      achievement: scoreData.achievement,
      fc: scoreData.fc,
      fs: scoreData.fs,
    })
    .from(snapshotScores)
    .innerJoin(scoreData, eq(snapshotScores.scoreId, scoreData.id))
    .innerJoin(songs, eq(scoreData.songId, songs.id))
    .innerJoin(parentSong, eq(songs.parentId, parentSong.id))
    .where(
      and(
        eq(parentSong.songName, songName),
        eq(parentSong.type, type),
        artist !== undefined ? eq(parentSong.artist, artist) : undefined,
        inArray(
          snapshotScores.snapshotId,
          db
            .selectDistinctOn([userSnapshots.region], { id: userSnapshots.id })
            .from(userSnapshots)
            .where(eq(userSnapshots.userId, userId))
            .orderBy(userSnapshots.region, desc(userSnapshots.fetchedAt))
        )
      )
    );

  if (scores.length === 0) return undefined;
  if (new Set(scores.map(score => score.artist)).size > 1) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Artist is required for songs with the same name" });
  }

  const userScores: NonNullable<SongDetails["userScores"]> = {};
  for (const score of scores) {
    if (!userScores[score.region]) {
      userScores[score.region] = {};
    }
    userScores[score.region][score.difficulty] = {
      achievement: score.achievement,
      fc: score.fc,
      fs: score.fs,
    };
  }
  return userScores;
}

export async function querySongDetails(
  songName: string,
  type: SongType,
  userId?: string | null,
  artist?: string
): Promise<SongDetails> {
  const chartsQuery = db
    .select({
      songId: songInstanceId,
      songName: parentSong.songName,
      artist: parentSong.artist,
      cover: parentSong.cover,
      difficulty: parentSong.difficulty,
      level: songs.level,
      levelPrecise: songs.levelPrecise,
      type: parentSong.type,
      genre: parentSong.genre,
      region: songs.region,
      gameVersion: songs.gameVersion,
      addedVersion: songs.addedVersion,
      bpm: parentSong.bpm,
      noteDesigner: songs.noteDesigner,
      tapCount: songs.tapCount,
      holdCount: songs.holdCount,
      slideCount: songs.slideCount,
      touchCount: songs.touchCount,
      breakCount: songs.breakCount,
    })
    .from(songs)
    .innerJoin(parentSong, eq(songs.parentId, parentSong.id))
    .where(and(eq(parentSong.songName, songName), eq(parentSong.type, type), artist !== undefined ? eq(parentSong.artist, artist) : undefined))
    .orderBy(songs.region, desc(songs.gameVersion), parentSong.difficulty);

  const scoresQuery = userId
    ? querySongScores(songName, type, userId, artist)
    : Promise.resolve(undefined);

  const [charts, scores] = await Promise.all([chartsQuery, scoresQuery]);

  if (charts.length === 0) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Song not found" });
  }

  if (new Set(charts.map(chart => chart.artist)).size > 1) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Artist is required for songs with the same name" });
  }

  const userScoresMap = scores;

  type ChartType = (typeof charts)[number];

  const byRegion = new Map<Region, Map<VersionId, ChartType[]>>();
  for (const chart of charts) {
    if (!byRegion.has(chart.region)) {
      byRegion.set(chart.region, new Map());
    }
    const chartVersion = chart.gameVersion as VersionId;
    const regionMap = byRegion.get(chart.region)!;
    if (!regionMap.has(chartVersion)) {
      regionMap.set(chartVersion, []);
    }
    regionMap.get(chartVersion)!.push(chart);
  }

  const regions: SongDetails["regions"] = Array.from(byRegion.entries()).map(([region, versionMap]) => {
    const versions = Array.from(versionMap.entries()).sort(([a], [b]) => b - a);
    return {
      region,
      versions: versions.map(([gameVersion, versionCharts], index) => ({
        gameVersion,
        charts: index === 0
          ? versionCharts.map((chart): SongDetailChart => ({
              difficulty: chart.difficulty,
              level: chart.level,
              levelPrecise: chart.levelPrecise,
              addedVersion: chart.addedVersion as VersionId,
              noteDesigner: chart.noteDesigner,
              tapCount: chart.tapCount,
              holdCount: chart.holdCount,
              slideCount: chart.slideCount,
              touchCount: chart.touchCount,
              breakCount: chart.breakCount,
            }))
          : versionCharts.map((chart): SongDetailHistoricalChart => ({
              difficulty: chart.difficulty,
              levelPrecise: chart.levelPrecise,
            })),
      })),
    };
  });

  const preferredChart: ChartType = maxBy(
    charts,
    (chart) => chart.gameVersion * 100 + (chart.region === "jp" ? 1 : 0)
  )!;
  const chartBpm = preferredChart.bpm || charts.find((c) => c.bpm !== null)?.bpm;

  return {
    songName: preferredChart.songName,
    artist: preferredChart.artist,
    cover: preferredChart.cover,
    type: preferredChart.type,
    genre: preferredChart.genre,
    bpm: chartBpm ?? null,
    addedVersion: preferredChart.addedVersion as VersionId,
    userScores: userScoresMap,
    regions,
  } satisfies SongDetails;
}

export async function queryAllUniqueSongs() {
  const getCachedUniqueSongs = unstable_cache(
    async () => {
      const allSongs = await db
        .select({
          id: songs.id,
          songName: parentSong.songName,
          artist: parentSong.artist,
          cover: parentSong.cover,
          type: parentSong.type,
          genre: parentSong.genre,
          difficulty: parentSong.difficulty,
          levelPrecise: songs.levelPrecise,
          noteDesigner: songs.noteDesigner,
          addedVersion: songs.addedVersion,
          region: songs.region,
          gameVersion: songs.gameVersion,
        })
        .from(songs)
        .innerJoin(parentSong, eq(songs.parentId, parentSong.id))
        .orderBy(parentSong.songName);

      const allSongsSortedById = [...allSongs].sort((a, b) => Number(a.id) - Number(b.id));
      const allSongsToSortedIndex = Object.fromEntries(
        allSongsSortedById.map((song, index) => [String(song.id), index])
      );
      const allSongsWithIndex = allSongs.map(
        (song) =>
          ({
            ...song,
            index: allSongsToSortedIndex[String(song.id)]!,
          }) satisfies Optional<typeof song, "id"> & { index: number }
      );

      const uniqueSongs: Map<
        string,
        (typeof allSongsWithIndex)[0] & {
          difficulties: (UniqueSongDifficulty & { region: Region; gameVersion: number })[];
        }
      > = new Map();
      for (const song of allSongsWithIndex) {
        const key = JSON.stringify([song.songName, song.artist, song.type]);
        if (!uniqueSongs.has(key)) {
          uniqueSongs.set(key, { ...song, difficulties: [] });
        } else {
          uniqueSongs.set(key, {
            ...uniqueSongs.get(key)!,
            difficulties: [...uniqueSongs.get(key)!.difficulties],
            ...song,
          });
        }
        const existingDifficulty = uniqueSongs
          .get(key)!
          .difficulties.find((d) => d.difficulty === song.difficulty);
        if (existingDifficulty) {
          if (
            existingDifficulty.gameVersion < song.gameVersion ||
            (existingDifficulty.gameVersion === song.gameVersion &&
              song.region === "jp" &&
              existingDifficulty.region === "intl")
          ) {
            uniqueSongs
              .get(key)!
              .difficulties.splice(
                uniqueSongs.get(key)!.difficulties.indexOf(existingDifficulty),
                1
              );
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
      const songsStripped: UniqueSong[] = songsWithSlugs.map((song) => ({
        index: song.index,
        songName: song.songName,
        artist: song.artist,
        cover: song.cover,
        type: song.type,
        genre: song.genre,
        addedVersion: song.addedVersion as VersionId,
        difficulties: song.difficulties
          .map(
            (d) =>
              ({
                difficulty: d.difficulty,
                levelPrecise: d.levelPrecise,
                noteDesigner: d.noteDesigner,
              }) satisfies UniqueSongDifficulty
          )
          .toSorted(
            (a, b) =>
              DIFFICULTY_ENUM.indexOf(a.difficulty) - DIFFICULTY_ENUM.indexOf(b.difficulty)
          ),
        slug: song.slug,
        aliases: song.aliases,
      }));
      return songsStripped;
    },
    ["all-unique-songs", "parent-v1"],
    { revalidate: 3600, tags: ["all-unique-songs"] }
  );

  return getCachedUniqueSongs();
}
