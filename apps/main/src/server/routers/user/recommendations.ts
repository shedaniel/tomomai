import { getEnabledRegions } from '@/lib/enabled-regions';
import { protectedProcedure, publicProcedure, router } from '@/lib/trpc';
import type { SongWithScore } from '@/lib/types';
import { fetchPublicSnapshotData } from '@/server/queries/public-snapshot';
import { fetchSnapshotData } from '@/server/queries/snapshots';
import { buildRecommendations, type RecommendationsResult } from '@/server/services/recommendations';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

const regionSchema = z.enum(getEnabledRegions());

// Played rows reference the songs the client already holds, which keeps the payload small.
function toResponse({ improve, tryNew }: RecommendationsResult) {
  return {
    improve: improve.map(({ song, ...rec }) => ({ ...rec, songId: song.songId })),
    tryNew,
  };
}

export const recommendationsRouter = router({
  getRecommendations: protectedProcedure
    .input(z.object({
      snapshotId: z.string(),
      region: regionSchema,
      usePeers: z.boolean(),
    }))
    .query(async ({ ctx, input }) => {
      const result = await fetchSnapshotData(ctx.session.user.id, input.snapshotId, input.region);
      if (!result) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Snapshot not found or access denied',
        });
      }
      return toResponse(await buildRecommendations({
        songs: result.songs as SongWithScore[],
        gameVersion: result.snapshot.gameVersion,
        region: input.region,
        rating: result.snapshot.rating,
        usePeers: input.usePeers,
        includeUnplayed: true,
      }));
    }),

  getPublicRecommendations: publicProcedure
    .input(z.object({
      username: z.string(),
      region: regionSchema,
      usePeers: z.boolean(),
    }))
    .query(async ({ input }) => {
      const data = await fetchPublicSnapshotData(input.username, input.region);
      return toResponse(await buildRecommendations({
        songs: data.songs as SongWithScore[],
        gameVersion: data.snapshot.gameVersion,
        region: input.region,
        rating: data.snapshot.rating,
        usePeers: input.usePeers,
        // Unplayed charts would reveal which charts a profile that hides non-best scores has played
        includeUnplayed: data.privacySettings.showAllScores,
      }));
    }),
});
