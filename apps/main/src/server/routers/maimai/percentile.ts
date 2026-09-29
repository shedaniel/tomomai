import { db } from "@/lib/db";
import { parentSong } from "@/lib/db/schema-pg";
import { publicProcedure, router } from "@/lib/trpc";
import { parentPublicIdOf } from "@/lib/catalog/song-instance-id";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { CanonicalGameId } from "@/lib/games/types";
import { getChartPercentiles } from "@/server/services/games/maimai/percentile/queries";
import { recommendationPeers, type RecommendationPeers } from "@/lib/games/maimai/percentile/potential";
import { ACCURACY_VALUES } from "@/lib/games/recommendations";
import type { PercentileMap } from "@/lib/games/maimai/percentile/types";
import { maimaiProcedure } from "./procedures";

async function parentIdsByPublicId(game: CanonicalGameId, publicSongIds: readonly string[]) {
  const publicIds = [...new Set(publicSongIds.map(parentPublicIdOf))];
  const rows = await db
    .select({ id: parentSong.id, publicId: parentSong.publicId })
    .from(parentSong)
    .where(and(eq(parentSong.game, game), inArray(parentSong.publicId, publicIds)));
  return new Map(rows.map(row => [row.publicId, row.id]));
}

export const percentileRouter = router({
  getRecommendationPeers: maimaiProcedure(publicProcedure, "percentiles")
    .input(z.object({
      publicSongIds: z.array(z.string()).max(2000),
      userRating: z.number().int().min(0).max(20000),
    }))
    .query(async ({ ctx, input }) => {
      if (!input.publicSongIds.length) return {} as Record<string, RecommendationPeers>;
      const idMap = await parentIdsByPublicId(ctx.game, input.publicSongIds);
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

  getChartPercentiles: maimaiProcedure(publicProcedure, "percentiles")
    .input(z.object({
      songs: z.array(z.object({
        publicSongId: z.string(),
        achievement: z.number().int().min(0).max(1010000),
      })).max(60),
      userRating: z.number().int().min(0).max(20000),
    }))
    .query(async ({ ctx, input }) => {
      const idMap = await parentIdsByPublicId(ctx.game, input.songs.map(song => song.publicSongId));
      const inputs = input.songs.flatMap((song) => {
        const parentId = idMap.get(parentPublicIdOf(song.publicSongId));
        return parentId == null ? [] : [{ publicSongId: song.publicSongId, parentId, achievement: song.achievement }];
      });

      const pctMap = await getChartPercentiles(inputs, input.userRating);

      const percentiles: PercentileMap = Object.fromEntries(pctMap);
      return { percentiles };
    }),
});
