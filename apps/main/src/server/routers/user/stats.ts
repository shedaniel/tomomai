import { protectedProcedure, publicProcedure, router } from '@/lib/trpc';
import { z } from 'zod';
import { getEnabledRegions } from "@tomomai/catalog/enabled-regions";
import { fetchPlayerStats, computeStatsForSnapshot } from '@/server/queries/stats';
import { resolvePublicSnapshotUserId } from '@/server/queries/public-access';

const regionSchema = z.enum(getEnabledRegions());

export const statsRouter = router({
  getPlayerStats: protectedProcedure
    .input(z.object({
      region: regionSchema,
    }))
    .query(async ({ ctx, input }) => {
      return await fetchPlayerStats(ctx.session.user.id, input.region);
    }),

  getPublicPlayerStats: publicProcedure
    .input(z.object({
      snapshotId: z.string(),
      region: regionSchema,
    }))
    .query(async ({ input }) => {
      const { snapshotInternalId, gameVersion } = await resolvePublicSnapshotUserId(input.snapshotId);

      return await computeStatsForSnapshot(snapshotInternalId, gameVersion, input.region);
    }),
});
