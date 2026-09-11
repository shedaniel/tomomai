import { db } from '@/lib/db';
import { parentSong } from '@/lib/db/schema-pg';
import { publicProcedure, router } from '@/lib/trpc';
import { parentPublicIdOf } from '@/lib/catalog/song-instance-id';
import { inArray } from 'drizzle-orm';
import { z } from 'zod';
import { getChartPercentiles } from '@/server/queries/percentile';
import { recommendationPeers, type RecommendationPeers } from '@/lib/recommendation-potential';
import { ACCURACY_VALUES } from '@/server/queries/recommendations';
import type { PercentileMap } from '@/lib/percentile-types';

export const percentileRouter = router({
  getRecommendationPeers: publicProcedure
    .input(z.object({
      publicSongIds: z.array(z.string()).max(2000),
      userRating: z.number().int().min(0).max(20000),
    }))
    .query(async ({ input }) => {
      if (!input.publicSongIds.length) return {} as Record<string, RecommendationPeers>;
      const publicIds = [...new Set(input.publicSongIds.map(parentPublicIdOf))];
      const rows = await db.select({ id: parentSong.id, publicId: parentSong.publicId })
        .from(parentSong).where(inArray(parentSong.publicId, publicIds));
      const idMap = new Map(rows.map((row) => [row.publicId, row.id]));
      const inputs = input.publicSongIds.flatMap((publicSongId) => {
        const parentId = idMap.get(parentPublicIdOf(publicSongId));
        return parentId == null ? [] : [{ publicSongId, parentId, achievement: 0 }];
      });
      const percentiles = await getChartPercentiles(inputs, input.userRating, true);
      const result: Record<string, RecommendationPeers> = {};
      for (const [id, data] of percentiles) {
        const peers = recommendationPeers(data, ACCURACY_VALUES);
        if (peers != null) result[id] = peers;
      }
      return result;
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
