import type { TRPCProcedureBuilder, TRPCUnsetMarker } from "@trpc/server";
import { z } from "zod";
import { resolveGameContext } from "@/lib/games/access";
import { gameIdSchema, regionSchema } from "@/lib/games/schema";
import type { GameCapability } from "@/lib/games/types";
import type { Context } from "@/lib/trpc";

/** publicProcedure, protectedProcedure or another base that has not declared an input yet. */
export type BaseProcedure<TContextOverrides extends object> = TRPCProcedureBuilder<
  Context,
  object,
  TContextOverrides,
  TRPCUnsetMarker,
  TRPCUnsetMarker,
  TRPCUnsetMarker,
  TRPCUnsetMarker,
  false
>;

/** Takes `{ game, region }` and puts the resolved pair on ctx. */
export function gameProcedure<TContextOverrides extends object>(base: BaseProcedure<TContextOverrides>, capability: GameCapability) {
  return base
    .input(z.object({ game: gameIdSchema, region: regionSchema }))
    .use(({ input, next }) => next({ ctx: resolveGameContext(input.game, { region: input.region, capability }) }));
}

/** Takes `{ game }` for features that do not depend on a region. */
export function gameOnlyProcedure<TContextOverrides extends object>(base: BaseProcedure<TContextOverrides>, capability: GameCapability) {
  return base
    .input(z.object({ game: gameIdSchema }))
    .use(({ input, next }) => next({ ctx: resolveGameContext(input.game, { capability }) }));
}
