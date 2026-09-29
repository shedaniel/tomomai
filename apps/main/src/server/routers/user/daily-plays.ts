import { maimaiCompatibilityGameSchema, regionSchema } from "@/lib/games/schema";
import { protectedProcedure, publicProcedure, router } from '@/lib/trpc';
import { z } from 'zod';
import { listDailyPlaysAvailableDays } from '@/server/services/games/maimai/render/daily-plays-data';
import { resolvePublicSnapshotUserId } from '@/server/queries/public-access';
import { validateGameInput } from './game-input';

export const dailyPlaysRouter = router({
  getAvailableDays: protectedProcedure
    .input(z.object({ game: maimaiCompatibilityGameSchema, region: regionSchema }))
    .query(async ({ ctx, input }) => {
      validateGameInput(input, "recents");
      return await listDailyPlaysAvailableDays(ctx.session.user.id, input.region);
    }),

  getPublicAvailableDays: publicProcedure
    .input(z.object({ game: maimaiCompatibilityGameSchema, snapshotId: z.string(), region: regionSchema }))
    .query(async ({ input }) => {
      validateGameInput(input, "recents");
      const { userId } = await resolvePublicSnapshotUserId(input.game, input.snapshotId);
      return await listDailyPlaysAvailableDays(userId, input.region);
    }),
});
