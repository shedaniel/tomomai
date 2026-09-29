import { defineGameHandler } from "@/lib/api/protect";
import { deleteToken } from "@/server/services/games/tokens";
import { spec } from "./spec";

export const DELETE = defineGameHandler(spec, async ({ game, key, query }) => {
  await deleteToken(game, key.userId, query.region);
  return { success: true } as const;
});
