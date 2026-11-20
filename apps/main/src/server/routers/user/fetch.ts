import { GameError } from "@/lib/games/errors";
import { gameProcedure } from "../game-procedures";
import { startScoreFetch, getScoreFetchStatus } from "@/server/services/games/fetch-sessions";
import { FetchStartError, toTrpcFetchStartError } from "@/server/services/games/fetch-errors";
import { deleteToken, tokenSavedAt } from "@/server/services/games/tokens";
import { protectedProcedure, router } from '@/lib/trpc';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { getGameSiteStatus } from "@/server/services/games/sega/budget";
import { useUserscriptFetch } from "@/lib/flags";

export const fetchRouter = router({
  startFetch: gameProcedure(protectedProcedure, "scores")
    .input(z.object({
      token: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await startScoreFetch({ game: ctx.game, region: ctx.region, userId: ctx.session.user.id, token: input.token });
      } catch (error) {
        if (error instanceof FetchStartError) throw toTrpcFetchStartError(error);
        if (error instanceof TRPCError || error instanceof GameError) throw error;
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to start fetch", cause: error });
      }
    }),

  // Whether the game site has locked us out or the shared request budget is busy, so
  // the fetch dialog can warn before the user starts a fetch.
  getSiteStatus: gameProcedure(protectedProcedure, "scores")
    .query(({ ctx }) => getGameSiteStatus(ctx.game, ctx.region)),

  getFetchStatus: gameProcedure(protectedProcedure, "scores")
    .query(({ ctx }) => {
      return getScoreFetchStatus({ game: ctx.game, region: ctx.region, userId: ctx.session.user.id });
    }),

  getLatestFetchSessionId: gameProcedure(protectedProcedure, "scores")
    .query(async ({ ctx }) => {
      const status = await getScoreFetchStatus({ game: ctx.game, region: ctx.region, userId: ctx.session.user.id });
      return status ? { id: status.id, startedAt: status.startedAt } : null;
    }),

  isUserscriptEnabled: protectedProcedure.query(() => useUserscriptFetch()),

  // Lets the token dialog notice a token saved elsewhere, such as by the userscript.
  getTokenSavedAt: gameProcedure(protectedProcedure, "scores")
    .query(({ ctx }) => tokenSavedAt(ctx.game, ctx.session.user.id, ctx.region)),

  deleteToken: gameProcedure(protectedProcedure, "scores")
    .mutation(async ({ ctx }) => {
      await deleteToken(ctx.game, ctx.session.user.id, ctx.region);
    }),
});
