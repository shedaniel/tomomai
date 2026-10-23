import { db } from '@/lib/db';
import { parentSong } from '@/lib/db/schema-pg';
import { publicProcedure, router } from '@/lib/trpc';
import { parentPublicIdOf } from '@/lib/catalog/song-instance-id';
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
      const publicIds = [...new Set(input.songs.map((s) => parentPublicIdOf(s.publicSongId)))];
      const rows = await db
        .select({ id: parentSong.id, publicId: parentSong.publicId })
        .from(parentSong)
        .where(inArray(parentSong.publicId, publicIds));

      const idMap = new Map(rows.map((r) => [r.publicId, r.id]));
      const inputs = input.songs
        .map((s) => ({ publicSongId: s.publicSongId, parentId: idMap.get(parentPublicIdOf(s.publicSongId))!, achievement: s.achievement }))
        .filter((s) => s.parentId != null);

      const pctMap = await getChartPercentiles(inputs, input.userRating);

      const percentiles: PercentileMap = Object.fromEntries(pctMap);
      return { percentiles };
    }),
});
