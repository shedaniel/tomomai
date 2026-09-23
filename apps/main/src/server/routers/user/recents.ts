import { gameContextInput, validateGameInput } from "./game-input";
import { fetchRecentSongsForGame } from "@/server/queries/recents";
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
  getRecentSongsForGame: protectedProcedure
    .input(z.object({ ...gameContextInput, limit: z.number().int().min(1).max(100).default(50), offset: z.number().int().min(0).default(0), beforeDate: z.date().optional() }))
    .query(({ ctx, input }) => {
      const { game, region } = validateGameInput(input, "recents");
      return fetchRecentSongsForGame(game, ctx.session.user.id, region, input.limit, input.offset, input.beforeDate);
    }),

  getRecentSongs: protectedProcedure
    .input(z.object({ game: z.literal("maimai").default("maimai"),
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
    .input(z.object({ game: z.literal("maimai").default("maimai"),
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
