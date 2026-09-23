import { gameContextInput, validateGameInput } from "./game-input";
import { fetchRecentSongs } from "@/server/queries/recents";
import { protectedProcedure, publicProcedure, router } from "@/lib/trpc";
import { resolvePublicSnapshotUserId } from "@/server/queries/public-access";
import { z } from "zod";

const recentInput = { ...gameContextInput, limit: z.number().int().min(1).max(100).default(50), offset: z.number().int().min(0).default(0), beforeDate: z.date().optional() };

export const recentsRouter = router({
  getRecentSongs: protectedProcedure.input(z.object(recentInput)).query(({ ctx, input }) => {
    const { game, region } = validateGameInput(input, "recents");
    return fetchRecentSongs(game, ctx.session.user.id, region, input.limit, input.offset, input.beforeDate);
  }),
  getPublicRecentSongs: publicProcedure.input(z.object({ ...recentInput, snapshotId: z.string() })).query(async ({ input }) => {
    const { game, region } = validateGameInput(input, "recents");
    const { userId } = await resolvePublicSnapshotUserId(game, input.snapshotId);
    return fetchRecentSongs(game, userId, region, input.limit, input.offset, input.beforeDate);
  }),
});
