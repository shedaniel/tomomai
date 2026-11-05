import { db } from "@/lib/db";
import { parentSong } from "@/lib/db/schema-pg";
import { publicProcedure, router } from "@/lib/trpc";
import { parentPublicIdOf } from "@tomomai/games/song-ids";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { CanonicalGameId } from "@/lib/games/ids";
import { getChartPercentiles } from "@/server/services/games/maimai/percentile/queries";
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
