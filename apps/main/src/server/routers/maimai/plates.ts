import { protectedProcedure, publicProcedure, router } from "@/lib/trpc";
import { z } from "zod";
import { fetchLatestPlateSongs, fetchPlateSongs } from "@/server/services/games/maimai/plates";
import { resolvePublicSnapshotUserId } from "@/server/queries/public-access";
import { maimaiRegionProcedure } from "./procedures";

const plateInput = z.object({
  version: z.string(),
  difficulty: z.enum(["basic", "advanced", "expert", "master"]),
  plateType: z.enum(["kiwami", "shou", "shin", "maimai"]),
});

export const platesRouter = router({
  getPlateSongs: maimaiRegionProcedure(protectedProcedure, "plates")
    .input(plateInput)
    .query(({ ctx, input }) => {
      return fetchLatestPlateSongs(ctx.game, ctx.session.user.id, ctx.region, input);
    }),

  getPublicPlateSongs: maimaiRegionProcedure(publicProcedure, "plates")
    .input(plateInput.extend({ snapshotId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { snapshotInternalId, gameVersion } = await resolvePublicSnapshotUserId(ctx.game, input.snapshotId);
      return fetchPlateSongs(ctx.game, { id: snapshotInternalId, gameVersion }, ctx.region, input);
    }),
});
