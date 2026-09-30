import { fetchPlayerStats, computeStatsForSnapshot } from "@/server/queries/stats";
import { protectedProcedure, publicProcedure, router } from "@/lib/trpc";
import { toPublicStats } from "@/lib/games/public-player";
import { gameProcedure, publicSnapshotProcedure } from "../game-procedures";

export const statsRouter = router({
  getPlayerStats: gameProcedure(protectedProcedure, "stats")
    .query(({ ctx }) => {
      return fetchPlayerStats(ctx.game, ctx.session.user.id, ctx.region);
    }),

  getPublicPlayerStats: publicSnapshotProcedure(publicProcedure, "stats", "stats")
    .query(async ({ ctx }) => {
      const { snapshot } = ctx;
      const stats = await computeStatsForSnapshot(ctx.game, snapshot.snapshotInternalId, snapshot.gameVersion, ctx.region);
      return toPublicStats(stats, snapshot.privacy);
    }),
});
