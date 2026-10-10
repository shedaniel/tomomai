import { defineGameHandler } from "@/lib/api/protect";
import { fetchPlayerStats } from "@/server/queries/stats";
import { spec } from "./spec";

export const GET = defineGameHandler(spec, async ({ game, key, query }) => {
  const { stats, totalSongs } = await fetchPlayerStats(game, key.userId, query.region);
  return { stats, totalSongs };
});
