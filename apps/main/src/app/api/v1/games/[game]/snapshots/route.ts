import { defineGameHandler } from "@/lib/api/protect";
import { fetchUserSnapshots } from "@/server/queries/snapshots";
import { spec } from "./spec";

export const GET = defineGameHandler(spec, async ({ game, key, query }) => {
  const snapshots = await fetchUserSnapshots(game, key.userId, query.region);

  return {
    snapshots: snapshots.map((s) => ({
      id: s.publicId,
      fetchedAt: s.fetchedAt.toISOString(),
      rating: s.rating,
      displayName: s.displayName,
      gameVersion: s.gameVersion,
      courseRankUrl: s.courseRankUrl,
      classRankUrl: s.classRankUrl,
      stars: s.stars,
      versionPlayCount: s.versionPlayCount,
      totalPlayCount: s.totalPlayCount,
    })),
  };
});
