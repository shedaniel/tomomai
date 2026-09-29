import { z } from "zod";
import { resolveGameContext } from "@/lib/games/access";
import { regionSchema } from "@/lib/games/schema";
import type { GameCapability } from "@/lib/games/types";
import type { BaseProcedure } from "../game-procedures";

const MAIMAI = "maimai" as const;

/** A maimai-only procedure. It takes no game input, so no other game can reach it. */
export function maimaiProcedure<TContextOverrides extends object>(base: BaseProcedure<TContextOverrides>, capability: GameCapability) {
  return base.use(({ next }) => {
    resolveGameContext(MAIMAI, { capability });
    return next({ ctx: { game: MAIMAI } });
  });
}

/** A maimai-only procedure that takes `{ region }`. */
export function maimaiRegionProcedure<TContextOverrides extends object>(base: BaseProcedure<TContextOverrides>, capability: GameCapability) {
  return base
    .input(z.object({ region: regionSchema }))
    .use(({ input, next }) => {
      const { region } = resolveGameContext(MAIMAI, { region: input.region, capability });
      return next({ ctx: { game: MAIMAI, region } });
    });
}
