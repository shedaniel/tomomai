import { protectedProcedure, publicProcedure, router } from '@/lib/trpc';
import { z } from 'zod';
import { getEnabledRegions } from '@/lib/enabled-regions';
import { findCreditSummary, listCreditSummaries } from '@/server/services/credit-data';
import { resolvePublicSnapshotUserId } from '@/server/queries/public-access';

const regionSchema = z.enum(getEnabledRegions());

const listInput = z.object({
  region: regionSchema,
  cursor: z.number().int().positive().optional(),
  limit: z.number().int().min(1).max(50).default(20),
});

const findInput = z.object({
  region: regionSchema,
  at: z.number().int().positive(),
});

function list(userId: string, input: z.infer<typeof listInput>) {
  return listCreditSummaries(userId, input.region, { cursor: input.cursor, limit: input.limit });
}

export const creditsRouter = router({
  getCredits: protectedProcedure
    .input(listInput)
    .query(({ ctx, input }) => list(ctx.session.user.id, input)),

  getPublicCredits: publicProcedure
    .input(listInput.extend({ snapshotId: z.string() }))
    .query(async ({ input }) => {
      const { userId } = await resolvePublicSnapshotUserId(input.snapshotId);
      return list(userId, input);
    }),

  getCredit: protectedProcedure
    .input(findInput)
    .query(({ ctx, input }) => findCreditSummary(ctx.session.user.id, input.region, input.at)),

  getPublicCredit: publicProcedure
    .input(findInput.extend({ snapshotId: z.string() }))
    .query(async ({ input }) => {
      const { userId } = await resolvePublicSnapshotUserId(input.snapshotId);
      return findCreditSummary(userId, input.region, input.at);
    }),
});
