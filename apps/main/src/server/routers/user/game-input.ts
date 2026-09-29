import { TRPCError } from "@trpc/server";
import { resolveGameContext } from "@/lib/games/access";
import { GameAdapterError } from "@/lib/games/errors";
import type { CanonicalGameId, GameCapability, GameRegionContext } from "@/lib/games/types";
import { gameIdSchema, regionSchema } from "@/lib/games/schema";

export const gameContextInput = {
  game: gameIdSchema,
  region: regionSchema,
};

export function validateGameCapability(game: CanonicalGameId, capability: GameCapability) {
  try {
    resolveGameContext(game, { capability });
  } catch (err) {
    if (err instanceof GameAdapterError) throw new TRPCError({ code: "BAD_REQUEST", message: err.message, cause: err });
    throw err;
  }
}

export function validateGameInput(input: GameRegionContext, capability: GameCapability) {
  try {
    return resolveGameContext(input.game, { region: input.region, capability });
  } catch (err) {
    if (err instanceof GameAdapterError) throw new TRPCError({ code: "BAD_REQUEST", message: err.message, cause: err });
    throw err;
  }
}
