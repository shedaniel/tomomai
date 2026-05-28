import { db } from '@/lib/db';
import { songs } from '@/lib/db/schema-pg';
import { publicProcedure, router } from '@/lib/trpc';
import { inArray } from 'drizzle-orm';
import { z } from 'zod';
import { getChartPercentiles } from '@/server/queries/percentile';
import type { PercentileMap } from '@/lib/percentile-types';

export const percentileRouter = router({
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
      const percentiles: PercentileMap = {};
      for (const [id, data] of pctMap.entries()) {
        const row = rows.find((r) => r.id === id);
        if (row) percentiles[row.publicId] = data;
      }
      return { percentiles };
    }),
});
