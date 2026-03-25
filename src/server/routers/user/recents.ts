import { protectedProcedure, publicProcedure, router } from '@/lib/trpc';
import { Region } from '@/lib/types';
import { z } from 'zod';
import { getEnabledRegions } from '@/lib/enabled-regions';
import { fetchRecentSongs } from '@/server/queries/recents';
import { resolvePublicSnapshotUserId } from '@/server/queries/public-access';

const regionSchema = z.enum(getEnabledRegions());

async function fetchAndMapRecents(
  userId: string,
  region: Region,
  limit: number,
  offset: number,
  beforeDate?: Date
) {
  const { recentPlays, totalCount, hasMore } = await fetchRecentSongs(
    userId,
    region,
    limit,
    offset,
    beforeDate
  );

  return {
    recentPlays: recentPlays.map(play => ({
      ...play,
      songPublicId: play.songId,
    })),
    totalCount,
    hasMore,
  };
}

export const recentsRouter = router({
  getRecentSongs: protectedProcedure
    .input(z.object({
      region: regionSchema,
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
      beforeDate: z.date().optional(),
    }))
    .query(async ({ ctx, input }) => {
      return await fetchAndMapRecents(
        ctx.session.user.id,
        input.region,
        input.limit,
        input.offset,
        input.beforeDate
      );
    }),

  getPublicRecentSongs: publicProcedure
    .input(z.object({
      snapshotId: z.string(),
      region: regionSchema,
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
      beforeDate: z.date().optional(),
    }))
    .query(async ({ input }) => {
      const { userId } = await resolvePublicSnapshotUserId(input.snapshotId);

      return await fetchAndMapRecents(
        userId,
        input.region,
        input.limit,
        input.offset,
        input.beforeDate
      );
    }),
});
