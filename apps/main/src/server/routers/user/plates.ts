import { maimaiCompatibilityGameSchema, regionSchema } from "@/lib/games/schema";
import { db } from '@/lib/db';
import { userSnapshots } from '@/lib/db/schema-pg';
import { protectedProcedure, publicProcedure, router } from '@/lib/trpc';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { fetchPlateSongs } from '@/server/services/games/maimai/plates';
import { resolvePublicSnapshotUserId } from '@/server/queries/public-access';
import { validateGameInput } from './game-input';

export const platesRouter = router({
  getPlateSongs: protectedProcedure
    .input(z.object({ game: maimaiCompatibilityGameSchema,
      region: regionSchema,
      version: z.string(),
      difficulty: z.enum(["basic", "advanced", "expert", "master"]),
      plateType: z.enum(["kiwami", "shou", "shin", "maimai"]),
    }))
    .query(async ({ ctx, input }) => {
      validateGameInput(input, "plates");
      const snapshot = await db
        .select({ id: userSnapshots.id, gameVersion: userSnapshots.gameVersion })
        .from(userSnapshots)
        .where(
          and(
            eq(userSnapshots.game, "maimai"),
            eq(userSnapshots.userId, ctx.session.user.id),
            eq(userSnapshots.region, input.region),
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
    .input(z.object({ game: maimaiCompatibilityGameSchema,
      snapshotId: z.string(),
      region: regionSchema,
      version: z.string(),
      difficulty: z.enum(["basic", "advanced", "expert", "master"]),
      plateType: z.enum(["kiwami", "shou", "shin", "maimai"]),
    }))
    .query(async ({ input }) => {
      validateGameInput(input, "plates");
      const { snapshotInternalId, gameVersion } = await resolvePublicSnapshotUserId(input.game, input.snapshotId);

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
