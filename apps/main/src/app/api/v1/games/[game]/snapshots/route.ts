import { defineGameHandler } from "@/lib/api/protect";
import { GAME_API_DETAILS } from "@/lib/api/schemas";
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
      versionPlayCount: s.versionPlayCount,
      totalPlayCount: s.totalPlayCount,
      details: GAME_API_DETAILS[game].snapshot(s),
    })),
  };
});
