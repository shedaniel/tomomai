import "server-only";
import { db } from "@/lib/db";
import { parentSong } from "@/lib/db/schema-pg";
import { recommendationPeers } from "@/lib/games/maimai/percentile/potential";
import type { RecommendationPeers } from "@/lib/games/recommendations";
import { parentPublicIdOf } from "@tomomai/games/song-ids";
import { and, eq, inArray } from "drizzle-orm";
import { getChartPercentiles, type ChartPercentileInput } from "./queries";

/** Nearby-Rating peer evidence per chart. `knownParentIds` skips the parent lookup for charts the caller already read. */
export async function fetchRecommendationPeers(
  publicSongIds: readonly string[],
  userRating: number,
  knownParentIds: ReadonlyMap<string, bigint> = new Map(),
): Promise<Record<string, RecommendationPeers>> {
  const unknownParents = [...new Set(publicSongIds.filter(id => !knownParentIds.has(id)).map(parentPublicIdOf))];
  const parentIds = new Map<string, bigint>();
  if (unknownParents.length) {
    const rows = await db.select({ id: parentSong.id, publicId: parentSong.publicId })
      .from(parentSong)
      .where(and(eq(parentSong.game, "maimai"), inArray(parentSong.publicId, unknownParents)));
    for (const row of rows) parentIds.set(row.publicId, row.id);
  }

  const inputs: ChartPercentileInput[] = publicSongIds.flatMap(publicSongId => {
    const parentId = knownParentIds.get(publicSongId) ?? parentIds.get(parentPublicIdOf(publicSongId));
    return parentId == null ? [] : [{ publicSongId, parentId, achievement: 0 }];
  });
  const percentiles = await getChartPercentiles(inputs, userRating, true);

  const result: Record<string, RecommendationPeers> = {};
  for (const [id, data] of percentiles) {
    const peers = recommendationPeers(data);
    if (peers != null) result[id] = peers;
  }
  return result;
}
