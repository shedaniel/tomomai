import { fetchPlayerStats, computeStatsForSnapshot } from "@/server/queries/stats";
import { protectedProcedure, publicProcedure, router } from "@/lib/trpc";
import { resolvePublicSnapshotUserId } from "@/server/queries/public-access";
import { z } from "zod";
import { gameProcedure } from "../game-procedures";

export const statsRouter = router({
  getPlayerStats: gameProcedure(protectedProcedure, "stats")
    .query(({ ctx }) => {
      return fetchPlayerStats(ctx.game, ctx.session.user.id, ctx.region);
    }),

  getPublicPlayerStats: gameProcedure(publicProcedure, "stats")
    .input(z.object({ snapshotId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { snapshotInternalId, gameVersion } = await resolvePublicSnapshotUserId(ctx.game, input.snapshotId);
      return computeStatsForSnapshot(ctx.game, snapshotInternalId, gameVersion, ctx.region);
    }),
});
