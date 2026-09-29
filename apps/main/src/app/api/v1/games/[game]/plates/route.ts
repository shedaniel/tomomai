import { defineGameHandler } from "@/lib/api/protect";
import { fetchLatestPlateSongs } from "@/server/services/games/maimai/plates";
import { spec } from "./spec";

export const GET = defineGameHandler(spec, async ({ game, key, query }) => {
  const { region, ...plate } = query;

  const scores = await fetchLatestPlateSongs(game, key.userId, region, plate);
  const songs = scores.map(({ difficultyCode, typeCode, ...score }) => ({ ...score, difficulty: difficultyCode, type: typeCode }));

  return { songs };
});
