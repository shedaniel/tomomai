import { maimaiCompatibilityGameSchema } from "@/lib/games/schema";
import { gameContextInput, validateGameInput } from "./game-input";
import { fetchPlayerStatsForGame } from "@/server/queries/stats";
import { protectedProcedure, publicProcedure, router } from '@/lib/trpc';
import { z } from 'zod';
import { getEnabledRegions } from '@/lib/enabled-regions';
import { fetchPlayerStats, computeStatsForSnapshot } from '@/server/queries/stats';
import { resolvePublicSnapshotUserId } from '@/server/queries/public-access';

const regionSchema = z.enum(getEnabledRegions());

export const statsRouter = router({
  getPlayerStatsForGame: protectedProcedure
    .input(z.object({ ...gameContextInput }))
    .query(({ ctx, input }) => {
      const { game, region } = validateGameInput(input, "scores");
      return fetchPlayerStatsForGame(game, ctx.session.user.id, region);
    }),

  getPlayerStats: protectedProcedure
    .input(z.object({ game: maimaiCompatibilityGameSchema,
      region: regionSchema,
    }))
    .query(async ({ ctx, input }) => {
      return await fetchPlayerStats(ctx.session.user.id, input.region);
    }),

  getPublicPlayerStats: publicProcedure
    .input(z.object({ game: maimaiCompatibilityGameSchema,
      snapshotId: z.string(),
      region: regionSchema,
    }))
    .query(async ({ input }) => {
      const { snapshotInternalId, gameVersion } = await resolvePublicSnapshotUserId(input.snapshotId);

      return await computeStatsForSnapshot(snapshotInternalId, gameVersion, input.region);
    }),
});
