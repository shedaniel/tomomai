import { getAvailableVersions } from "@/lib/games/versions";
import { protectedProcedure, router } from "@/lib/trpc";
import { fetchSnapshotDataByPublicId } from "@/server/queries/snapshots";
import { listCatalogVersionsWithSongs } from "@/server/queries/songs";
import { toMaimaiExport } from "@/server/services/games/maimai/export";
import { copySnapshotToVersion } from "@/server/services/games/snapshot-copy";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { maimaiProcedure, maimaiRegionProcedure } from "./procedures";

export const snapshotToolsRouter = router({
  exportSnapshotData: maimaiProcedure(protectedProcedure, "snapshot-export")
    .input(z.object({ snapshotId: z.string() }))
    .query(async ({ ctx, input }) => {
      const data = await fetchSnapshotDataByPublicId(ctx.game, ctx.session.user.id, input.snapshotId);
      if (!data) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Snapshot not found or access denied",
        });
      }
      return toMaimaiExport(data);
    }),

  getAvailableVersionsForCopy: maimaiRegionProcedure(protectedProcedure, "snapshot-copy")
    .input(z.object({ currentVersion: z.number() }))
    .query(async ({ ctx, input }) => {
      const versionsWithSongs = new Set(await listCatalogVersionsWithSongs(ctx.game, ctx.region));
      return {
        availableVersions: getAvailableVersions(ctx.game, ctx.region)
          .filter(version => version.id !== input.currentVersion && versionsWithSongs.has(version.id)),
      };
    }),

  copySnapshotToVersion: maimaiRegionProcedure(protectedProcedure, "snapshot-copy")
    .input(z.object({
      snapshotId: z.string(),
      targetVersion: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { game, region } = ctx;
      const userId = ctx.session.user.id;
      const copied = await copySnapshotToVersion({
        game,
        userId,
        snapshotPublicId: input.snapshotId,
        region,
        targetVersion: input.targetVersion,
      });
      if (!copied) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Snapshot not found or access denied",
        });
      }
      return { success: true, ...copied };
    }),
});
