import { protectedProcedure, publicProcedure, router } from "@/lib/trpc";
import { plateSelection } from "@/lib/api/schemas/maimai";
import { fetchLatestPlateSongs, fetchPlateSongs } from "@/server/services/games/maimai/plates";
import { maimaiPublicSnapshotProcedure, maimaiRegionProcedure } from "./procedures";

export const platesRouter = router({
  getPlateSongs: maimaiRegionProcedure(protectedProcedure, "plates")
    .input(plateSelection)
    .query(({ ctx, input }) => {
      return fetchLatestPlateSongs(ctx.game, ctx.session.user.id, ctx.region, input);
    }),

  getPublicPlateSongs: maimaiPublicSnapshotProcedure(publicProcedure, "plates", "plates")
    .input(plateSelection)
    .query(({ ctx, input }) => {
      const { snapshotInternalId, gameVersion } = ctx.snapshot;
      return fetchPlateSongs(ctx.game, { id: snapshotInternalId, gameVersion }, ctx.region, input);
    }),
});
