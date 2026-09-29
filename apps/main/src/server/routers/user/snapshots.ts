import type { GameSnapshotData } from "@/lib/games/player-view";
import { gameContextInput, validateGameInput } from "./game-input";
import { deleteUserSnapshot, fetchSnapshotData, fetchUserSnapshots } from "@/server/queries/snapshots";
import { fetchRatingHistory } from "@/server/queries/rating-history";
import { protectedProcedure, router } from '@/lib/trpc';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { revalidatePublicProfileForUser } from '@/lib/profile-cache';

export const snapshotsRouter = router({
  getSnapshots: protectedProcedure
    .input(z.object({ ...gameContextInput }))
    .query(({ ctx, input }) => {
      const { game, region } = validateGameInput(input, "scores");
      return fetchUserSnapshots(game, ctx.session.user.id, region);
    }),
  /** Null when the snapshot is missing or belongs to someone else. The dashboard and its server prefetch show that as no data, not an error. */
  getSnapshotData: protectedProcedure
    .input(z.object({ ...gameContextInput, snapshotId: z.string() }))
    .query(async ({ ctx, input }): Promise<GameSnapshotData | null> => {
      const { game, region } = validateGameInput(input, "scores");
      return fetchSnapshotData(game, ctx.session.user.id, input.snapshotId, region);
    }),

  getRatingHistory: protectedProcedure
    .input(z.object(gameContextInput))
    .query(({ ctx, input }) => {
      const { game, region } = validateGameInput(input, "rating");
      return fetchRatingHistory(game, ctx.session.user.id, region);
    }),

  deleteSnapshot: protectedProcedure
    .input(z.object({ ...gameContextInput, snapshotId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { game } = validateGameInput(input, "scores");
      const { deleted } = await deleteUserSnapshot(
        game, ctx.session.user.id,
        input.snapshotId,
        input.region,
      );
      if (!deleted) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Snapshot not found or access denied',
        });
      }
      await revalidatePublicProfileForUser(input.game, ctx.session.user.id, [input.region]);
      return { success: true };
    }),
});
