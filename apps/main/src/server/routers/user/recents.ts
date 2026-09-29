import { fetchRecentSongs } from "@/server/queries/recents";
import { protectedProcedure, publicProcedure, router } from "@/lib/trpc";
import { resolvePublicSnapshotUserId } from "@/server/queries/public-access";
import { z } from "zod";
import { gameProcedure } from "../game-procedures";

const pageInput = z.object({
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
  beforeDate: z.date().optional(),
});

export const recentsRouter = router({
  getRecentSongs: gameProcedure(protectedProcedure, "recents")
    .input(pageInput)
    .query(({ ctx, input }) => {
      return fetchRecentSongs(ctx.game, ctx.session.user.id, ctx.region, input.limit, input.offset, input.beforeDate);
    }),

  getPublicRecentSongs: gameProcedure(publicProcedure, "recents")
    .input(pageInput.extend({ snapshotId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { userId } = await resolvePublicSnapshotUserId(ctx.game, input.snapshotId);
      return fetchRecentSongs(ctx.game, userId, ctx.region, input.limit, input.offset, input.beforeDate);
    }),
});
