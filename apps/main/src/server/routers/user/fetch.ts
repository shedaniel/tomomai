import { SEGA_AIME_GATEWAY, siteRoot } from "@/lib/games/sites";
import { getGame } from "@/lib/games/registry";
import { GameAdapterError } from "@/lib/games/errors";
import { gameProcedure } from "../game-procedures";
import { startScoreFetch, getScoreFetchStatus } from "@/server/services/games/fetch-sessions";
import { FetchStartError, toTrpcFetchStartError } from "@/server/services/games/fetch-errors";
import { generateUserOtp, getOtpExpiryTimestamp, createLoginAuthorization } from '@/lib/otp';
import { deleteToken } from "@/server/services/games/tokens";
import { resolveBaseUrl } from '@/lib/base-url';
import { protectedProcedure, router } from '@/lib/trpc';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

export const fetchRouter = router({
  getLoginOtp: gameProcedure(protectedProcedure, "scores")
    .query(({ ctx }) => {
      const { game, region } = ctx;
      if (!getGame(game).loginMethods[region]?.includes("sega-cookie")) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cookie login is not available for this game and region" });
      }
      const userId = ctx.session.user.id;
      const otp = generateUserOtp(userId);
      const expiresAt = new Date(getOtpExpiryTimestamp()).toISOString();
      const baseUrl = resolveBaseUrl();
      const scriptUrl = `${baseUrl}/api/login.js`;
      const authorization = createLoginAuthorization({ userId, game, region });
      const loginLink = `${SEGA_AIME_GATEWAY.landingUrl}#otp=${otp}&user=${encodeURIComponent(authorization)}`;

      return {
        otp,
        scriptUrl,
        loginLink,
        loginPageUrl: siteRoot(game, region).href,
        expiresAt,
      };
    }),

  startFetch: gameProcedure(protectedProcedure, "scores")
    .input(z.object({
      token: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await startScoreFetch({ game: ctx.game, region: ctx.region, userId: ctx.session.user.id, token: input.token });
      } catch (error) {
        if (error instanceof FetchStartError) throw toTrpcFetchStartError(error);
        if (error instanceof TRPCError || error instanceof GameAdapterError) throw error;
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to start fetch", cause: error });
      }
    }),

  getFetchStatus: gameProcedure(protectedProcedure, "scores")
    .query(({ ctx }) => {
      return getScoreFetchStatus({ game: ctx.game, region: ctx.region, userId: ctx.session.user.id });
    }),

  getLatestFetchSessionId: gameProcedure(protectedProcedure, "scores")
    .query(async ({ ctx }) => {
      const status = await getScoreFetchStatus({ game: ctx.game, region: ctx.region, userId: ctx.session.user.id });
      return status ? { id: status.id, startedAt: status.startedAt } : null;
    }),

  deleteToken: gameProcedure(protectedProcedure, "scores")
    .mutation(async ({ ctx }) => {
      await deleteToken(ctx.game, ctx.session.user.id, ctx.region);
    }),
});
