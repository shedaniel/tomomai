import { z } from "zod";
import { resolveGameContext } from "@/lib/games/access";
import type { PublicView } from "@/lib/games/public-player";
import { regionSchema } from "@/lib/games/schema";
import type { GameCapability } from "@/lib/games/types";
import { resolvePublicSnapshotAccess } from "@/server/queries/public-access";
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

/** A maimai-only procedure that takes `{ snapshotId }` from a visitor, with the snapshot and its region on ctx. */
export function maimaiPublicSnapshotProcedure<TContextOverrides extends object>(base: BaseProcedure<TContextOverrides>, capability: GameCapability, view: PublicView) {
  return base
    .input(z.object({ snapshotId: z.string() }))
    .use(async ({ input, next }) => {
      const snapshot = await resolvePublicSnapshotAccess(MAIMAI, input.snapshotId, { capability, view });
      return next({ ctx: { game: MAIMAI, region: snapshot.region, snapshot } });
    });
}
