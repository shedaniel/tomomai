import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "@/lib/trpc";
import { findCreditSummary, listCreditSummaries } from "@/server/services/games/maimai/render/credit-data";
import { maimaiPublicSnapshotProcedure, maimaiRegionProcedure } from "./procedures";

const listInput = z.object({
  before: z.number().int().positive().optional(),
  cursor: z.number().int().positive().optional(),
  limit: z.number().int().min(1).max(50).default(20),
});

const findInput = z.object({
  at: z.number().int().positive(),
});

export const creditsRouter = router({
  getCredits: maimaiRegionProcedure(protectedProcedure, "last-credit")
    .input(listInput)
    .query(({ ctx, input }) => listCreditSummaries(ctx.session.user.id, ctx.region, input)),

  getPublicCredits: maimaiPublicSnapshotProcedure(publicProcedure, "last-credit", "recentPlays")
    .input(listInput)
    .query(({ ctx, input }) => listCreditSummaries(ctx.snapshot.userId, ctx.region, input)),

  getCredit: maimaiRegionProcedure(protectedProcedure, "last-credit")
    .input(findInput)
    .query(({ ctx, input }) => findCreditSummary(ctx.session.user.id, ctx.region, input.at)),

  getPublicCredit: maimaiPublicSnapshotProcedure(publicProcedure, "last-credit", "recentPlays")
    .input(findInput)
    .query(({ ctx, input }) => findCreditSummary(ctx.snapshot.userId, ctx.region, input.at)),
});
