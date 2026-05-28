import { protectedProcedure, publicProcedure, router } from '@/lib/trpc';
import { z } from 'zod';
import { getEnabledRegions } from '@/lib/enabled-regions';
import { listDailyPlaysAvailableDays } from '@/server/services/daily-plays-data';
import { resolvePublicSnapshotUserId } from '@/server/queries/public-access';

const regionSchema = z.enum(getEnabledRegions());

export const dailyPlaysRouter = router({
  getAvailableDays: protectedProcedure
    .input(z.object({ region: regionSchema }))
    .query(async ({ ctx, input }) => {
      return await listDailyPlaysAvailableDays(ctx.session.user.id, input.region);
    }),

  getPublicAvailableDays: publicProcedure
    .input(z.object({ snapshotId: z.string(), region: regionSchema }))
    .query(async ({ input }) => {
      const { userId } = await resolvePublicSnapshotUserId(input.snapshotId);
      return await listDailyPlaysAvailableDays(userId, input.region);
    }),
});
