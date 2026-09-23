import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { resolveGameContext } from "@/lib/games/registry";
import { GameAdapterError, type GameCapability } from "@/lib/games/types";
import { gameIdSchema } from "@/lib/games/schema";
import type { Region } from "@/lib/types";

export const gameContextInput = {
  game: gameIdSchema,
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
