import type { TRPCProcedureBuilder, TRPCUnsetMarker } from "@trpc/server";
import { z } from "zod";
import { resolveGameContext } from "@/lib/games/access";
import type { PublicView } from "@/lib/games/public-player";
import { gameIdSchema, regionSchema } from "@/lib/games/schema";
import type { GameCapability } from "@/lib/games/types";
import type { Context } from "@/lib/trpc";
import { resolvePublicSnapshotAccess } from "@/server/queries/public-access";

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
    .use(({ input, next }) => {
      const { game } = resolveGameContext(input.game, { capability });
      return next({ ctx: { game } });
    });
}

/** Takes `{ game, snapshotId }` from a visitor and puts the published snapshot and its own region on ctx. */
export function publicSnapshotProcedure<TContextOverrides extends object>(base: BaseProcedure<TContextOverrides>, capability: GameCapability, view: PublicView) {
  return base
    .input(z.object({ game: gameIdSchema, snapshotId: z.string() }))
    .use(async ({ input, next }) => {
      const snapshot = await resolvePublicSnapshotAccess(input.game, input.snapshotId, { capability, view });
      return next({ ctx: { game: input.game, region: snapshot.region, snapshot } });
    });
}
