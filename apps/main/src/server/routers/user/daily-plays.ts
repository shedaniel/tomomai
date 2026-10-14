import { protectedProcedure, publicProcedure, router } from "@/lib/trpc";
import { listDailyPlaysAvailableDays } from "@/server/services/games/maimai/render/daily-plays-data";
import { maimaiPublicSnapshotProcedure, maimaiRegionProcedure } from "./procedures";

export const dailyPlaysRouter = router({
  getAvailableDays: maimaiRegionProcedure(protectedProcedure, "daily-plays")
    .query(({ ctx }) => {
      return listDailyPlaysAvailableDays(ctx.session.user.id, ctx.region);
    }),

  getPublicAvailableDays: maimaiPublicSnapshotProcedure(publicProcedure, "daily-plays", "recentPlays")
    .query(({ ctx }) => {
      return listDailyPlaysAvailableDays(ctx.snapshot.userId, ctx.region);
    }),
});
