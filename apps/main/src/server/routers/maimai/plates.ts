import { protectedProcedure, publicProcedure, router } from "@/lib/trpc";
import { z } from "zod";
import { plateSelection } from "@/lib/api/schemas/maimai";
import { fetchLatestPlateSongs, fetchPlateSongs } from "@/server/services/games/maimai/plates";
import { resolvePublicSnapshotUserId } from "@/server/queries/public-access";
import { maimaiRegionProcedure } from "./procedures";

export const platesRouter = router({
  getPlateSongs: maimaiRegionProcedure(protectedProcedure, "plates")
    .input(plateSelection)
    .query(({ ctx, input }) => {
      return fetchLatestPlateSongs(ctx.game, ctx.session.user.id, ctx.region, input);
    }),

  getPublicPlateSongs: maimaiRegionProcedure(publicProcedure, "plates")
    .input(plateSelection.extend({ snapshotId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { snapshotInternalId, gameVersion } = await resolvePublicSnapshotUserId(ctx.game, input.snapshotId);
      return fetchPlateSongs(ctx.game, { id: snapshotInternalId, gameVersion }, ctx.region, input);
    }),
});
