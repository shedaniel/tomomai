import { protectedProcedure, publicProcedure, router } from '@/lib/trpc';
import { fetchPublicGameProfile } from '@/server/queries/game-profile';
import { fetchSnapshotData } from '@/server/queries/snapshots';
import { buildRecommendations, type RecommendationsResult } from '@/server/services/recommendations';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { gameProcedure } from '../game-procedures';

// Played rows reference the scores the client already holds, which keeps the payload small.
function toResponse({ improve, tryNew }: RecommendationsResult) {
  return {
    improve: improve.map(({ song, ...rec }) => ({ ...rec, songId: song.songId })),
    tryNew,
  };
}

export const recommendationsRouter = router({
  getRecommendations: gameProcedure(protectedProcedure, "scores")
    .input(z.object({ snapshotId: z.string(), usePeers: z.boolean() }))
    .query(async ({ ctx, input }) => {
      const data = await fetchSnapshotData(ctx.game, ctx.session.user.id, input.snapshotId, ctx.region);
      if (!data) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Snapshot not found or access denied',
        });
      }
      return toResponse(await buildRecommendations({ data, region: ctx.region, usePeers: input.usePeers, includeUnplayed: true }));
    }),

  getPublicRecommendations: gameProcedure(publicProcedure, "scores")
    .input(z.object({ username: z.string(), usePeers: z.boolean() }))
    .query(async ({ ctx, input }) => {
      const { profile, snapshotData } = await fetchPublicGameProfile(ctx.game, input.username, ctx.region, ctx.session?.user.id);
      if (!snapshotData) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No data available for this region',
        });
      }
      return toResponse(await buildRecommendations({
        data: snapshotData,
        region: ctx.region,
        usePeers: input.usePeers,
        // Unplayed charts would reveal which charts a profile that hides non-best scores has played
        includeUnplayed: profile.profileShowAllScores,
      }));
    }),
});
