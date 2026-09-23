import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { resolveGameContext } from "@/lib/games/registry";
import { CANONICAL_GAME_IDS, GameAdapterError, type GameCapability } from "@/lib/games/types";
import type { Region } from "@/lib/types";

export const gameContextInput = {
  game: z.enum(CANONICAL_GAME_IDS),
  region: z.enum(["intl", "jp", "cn"]),
};

export function validateGameInput(input: { game: string; region: Region }, capability?: GameCapability) {
  try {
    return resolveGameContext(input.game, input.region, capability);
  } catch (err) {
    if (err instanceof GameAdapterError) throw new TRPCError({ code: "BAD_REQUEST", message: err.message, cause: err });
    throw err;
  }
}
