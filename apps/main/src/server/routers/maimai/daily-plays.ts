import { protectedProcedure, publicProcedure, router } from "@/lib/trpc";
import { z } from "zod";
import { listDailyPlaysAvailableDays } from "@/server/services/games/maimai/render/daily-plays-data";
import { resolvePublicSnapshotUserId } from "@/server/queries/public-access";
import { maimaiRegionProcedure } from "./procedures";

export const dailyPlaysRouter = router({
  getAvailableDays: maimaiRegionProcedure(protectedProcedure, "daily-plays")
    .query(({ ctx }) => {
      return listDailyPlaysAvailableDays(ctx.session.user.id, ctx.region);
    }),

  getPublicAvailableDays: maimaiRegionProcedure(publicProcedure, "daily-plays")
    .input(z.object({ snapshotId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { userId } = await resolvePublicSnapshotUserId(ctx.game, input.snapshotId);
      return listDailyPlaysAvailableDays(userId, ctx.region);
    }),
});
