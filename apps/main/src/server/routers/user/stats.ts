import { gameContextInput, validateGameInput } from "./game-input";
import { fetchPlayerStats, computeStatsForSnapshot } from "@/server/queries/stats";
import { protectedProcedure, publicProcedure, router } from "@/lib/trpc";
import { resolvePublicSnapshotUserId } from "@/server/queries/public-access";
import { z } from "zod";

export const statsRouter = router({
  getPlayerStats: protectedProcedure.input(z.object(gameContextInput)).query(({ ctx, input }) => {
    const { game, region } = validateGameInput(input, "scores");
    return fetchPlayerStats(game, ctx.session.user.id, region);
  }),
  getPublicPlayerStats: publicProcedure.input(z.object({ ...gameContextInput, snapshotId: z.string() })).query(async ({ input }) => {
    const { game, region } = validateGameInput(input, "scores");
    const { snapshotInternalId, gameVersion } = await resolvePublicSnapshotUserId(game, input.snapshotId);
    return computeStatsForSnapshot(game, snapshotInternalId, gameVersion, region);
  }),
});
