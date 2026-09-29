import { TRPCError } from "@trpc/server";
import { requireCapability, resolveGameContext } from "@/lib/games/registry";
import { GameAdapterError, type CanonicalGameId, type GameCapability, type GameRegionContext } from "@/lib/games/types";
import { gameIdSchema, regionSchema } from "@/lib/games/schema";

export const gameContextInput = {
  game: gameIdSchema,
  region: regionSchema,
};

export function validateGameCapability(game: CanonicalGameId, capability: GameCapability) {
  try {
    requireCapability(game, capability);
  } catch (err) {
    if (err instanceof GameAdapterError) throw new TRPCError({ code: "BAD_REQUEST", message: err.message, cause: err });
    throw err;
  }
}

export function validateGameInput(input: GameRegionContext, capability: GameCapability) {
  try {
    return resolveGameContext(input.game, input.region, capability);
  } catch (err) {
    if (err instanceof GameAdapterError) throw new TRPCError({ code: "BAD_REQUEST", message: err.message, cause: err });
    throw err;
  }
}
