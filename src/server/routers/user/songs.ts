import { db } from '@/lib/db';
import { songs } from '@/lib/db/schema-pg';
import { VersionId } from '@/lib/metadata';
import { getSongSlug } from '@/lib/song-slug';
import { publicProcedure, router } from '@/lib/trpc';
import { TRPCError } from '@trpc/server';
import { eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { queryAllUniqueSongs, querySongDetails } from '@/server/queries/songs';
import { getChartPercentiles } from '@/server/queries/percentile';

export const songsRouter = router({
  getAllUniqueSongs: publicProcedure
    .query(async () => {
      return queryAllUniqueSongs();
    }),

  getSongDetails: publicProcedure
    .input(z.object({
      songName: z.string(),
      type: z.enum(['std', 'dx']),
    }))
    .query(async ({ input, ctx }) => {
      return querySongDetails(input.songName, input.type, ctx.session?.user?.id);
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

  getChartPercentiles: publicProcedure
    .input(z.object({
      songs: z.array(z.object({
        publicSongId: z.string(),
        achievement: z.number().int().min(0).max(1010000),
      })).max(60),
      userRating: z.number().int().min(0).max(20000),
    }))
    .query(async ({ input }) => {
      const publicIds = input.songs.map((s) => s.publicSongId);
      const rows = await db
        .select({ id: songs.id, publicId: songs.publicId })
        .from(songs)
        .where(inArray(songs.publicId, publicIds));

      const idMap = new Map(rows.map((r) => [r.publicId, r.id]));
      const inputs = input.songs
        .map((s) => ({ internalSongId: idMap.get(s.publicSongId)!, achievement: s.achievement }))
        .filter((s) => s.internalSongId != null);

      const pctMap = await getChartPercentiles(inputs, input.userRating);

      // Serialize: bigint keys → publicId string keys
      const percentiles: Record<string, { percentile: number; peerCount: number; distribution: { lo: number; count: number }[] }> = {};
      for (const [id, data] of pctMap.entries()) {
        const row = rows.find((r) => r.id === id);
        if (row) percentiles[row.publicId] = data;
      }
      return { percentiles };
    }),
});
