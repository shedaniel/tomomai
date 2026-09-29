import type { GameSnapshotData } from "@/lib/games/player-view";
import { deleteUserSnapshot, fetchSnapshotData, fetchUserSnapshots } from "@/server/queries/snapshots";
import { fetchRatingHistory } from "@/server/queries/rating-history";
import { protectedProcedure, router } from '@/lib/trpc';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { revalidatePublicProfileForUser } from '@/lib/profile-cache';
import { gameProcedure } from "../game-procedures";

export const snapshotsRouter = router({
  getSnapshots: gameProcedure(protectedProcedure, "scores")
    .query(({ ctx }) => {
      return fetchUserSnapshots(ctx.game, ctx.session.user.id, ctx.region);
    }),

  /** Null when the snapshot is missing or belongs to someone else. The dashboard and its server prefetch show that as no data, not an error. */
  getSnapshotData: gameProcedure(protectedProcedure, "scores")
    .input(z.object({ snapshotId: z.string() }))
    .query(({ ctx, input }): Promise<GameSnapshotData | null> => {
      return fetchSnapshotData(ctx.game, ctx.session.user.id, input.snapshotId, ctx.region);
    }),

  getRatingHistory: gameProcedure(protectedProcedure, "rating")
    .query(({ ctx }) => {
      return fetchRatingHistory(ctx.game, ctx.session.user.id, ctx.region);
    }),

  deleteSnapshot: gameProcedure(protectedProcedure, "scores")
    .input(z.object({ snapshotId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { game, region } = ctx;
      const userId = ctx.session.user.id;
      const { deleted } = await deleteUserSnapshot(game, userId, input.snapshotId, region);
      if (!deleted) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Snapshot not found or access denied',
        });
      }
      await revalidatePublicProfileForUser(game, userId, [region]);
      return { success: true };
    }),
});
