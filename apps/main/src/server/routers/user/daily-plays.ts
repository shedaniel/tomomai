import { protectedProcedure, publicProcedure, router } from "@/lib/trpc";
import { listDailyPlaysAvailableDays } from "@/server/services/games/images/daily-plays";
import { gameProcedure, publicSnapshotProcedure } from "../game-procedures";

export const dailyPlaysRouter = router({
  getAvailableDays: gameProcedure(protectedProcedure, "daily-plays")
    .query(({ ctx }) => {
      return listDailyPlaysAvailableDays(ctx.game, ctx.session.user.id, ctx.region);
    }),

  getPublicAvailableDays: publicSnapshotProcedure(publicProcedure, "daily-plays", "recentPlays")
    .query(({ ctx }) => {
      return listDailyPlaysAvailableDays(ctx.game, ctx.snapshot.userId, ctx.region);
    }),
});
