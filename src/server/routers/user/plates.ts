import { db } from '@/lib/db';
import { userSnapshots } from '@/lib/db/schema-pg';
import { protectedProcedure, publicProcedure, router } from '@/lib/trpc';
import { TRPCError } from '@trpc/server';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getEnabledRegions } from '@/lib/enabled-regions';
import { fetchPlateSongs } from '@/server/queries/plates';
import { resolvePublicSnapshotUserId } from '@/server/queries/public-access';

const regionSchema = z.enum(getEnabledRegions());

export const platesRouter = router({
  getPlateSongs: protectedProcedure
    .input(z.object({
      region: regionSchema,
      version: z.string(),
      difficulty: z.enum(["basic", "advanced", "expert", "master"]),
      plateType: z.enum(["kyoku", "shou", "shin", "maimai"]),
    }))
    .query(async ({ ctx, input }) => {
      const snapshot = await db
        .select({ id: userSnapshots.id, gameVersion: userSnapshots.gameVersion })
        .from(userSnapshots)
        .where(
          and(
            eq(userSnapshots.userId, ctx.session.user.id),
            eq(userSnapshots.region, input.region)
          )
        )
        .orderBy(desc(userSnapshots.fetchedAt))
        .limit(1);

      if (snapshot.length === 0) {
        return [];
      }

      return await fetchPlateSongs(
        snapshot[0].id,
        snapshot[0].gameVersion,
        input.region,
        input.version,
        input.difficulty,
        input.plateType
      );
    }),

  getPublicPlateSongs: publicProcedure
    .input(z.object({
      snapshotId: z.string(),
      region: regionSchema,
      version: z.string(),
      difficulty: z.enum(["basic", "advanced", "expert", "master"]),
      plateType: z.enum(["kyoku", "shou", "shin", "maimai"]),
    }))
    .query(async ({ input }) => {
      const { snapshotInternalId, gameVersion } = await resolvePublicSnapshotUserId(input.snapshotId);

      return await fetchPlateSongs(
        snapshotInternalId,
        gameVersion,
        input.region,
        input.version,
        input.difficulty,
        input.plateType
      );
    }),
});
