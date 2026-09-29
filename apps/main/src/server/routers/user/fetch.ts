import { getGameSite } from "@/lib/games/sites";
import { getGame } from "@/lib/games/registry";
import { GameAdapterError } from "@/lib/games/errors";
import { gameOnlyProcedure, gameProcedure } from "../game-procedures";
import { startScoreFetch, getScoreFetchStatus } from "@/server/services/games/score-ingestion";
import { FetchStartError, toTrpcFetchStartError } from "@/server/services/games/fetch-errors";
import { db } from '@/lib/db';
import { generateUserOtp, getOtpExpiryTimestamp, createLoginAuthorization } from '@/lib/otp';
import { deleteToken } from "@/server/services/games/tokens";
import { resolveBaseUrl } from '@/lib/base-url';
import { protectedProcedure, router } from '@/lib/trpc';
import { TRPCError } from '@trpc/server';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';

export const fetchRouter = router({
  getLoginOtp: gameOnlyProcedure(protectedProcedure, "scores")
    .query(({ ctx }) => {
      const { game } = ctx;
      const { cookieLogin } = getGame(game).fetch;
      const loginPage = cookieLogin && getGameSite(game, cookieLogin.region);
      if (!cookieLogin || !loginPage) throw new TRPCError({ code: "BAD_REQUEST", message: "Cookie login is not available for this game" });
      const userId = ctx.session.user.id;
      const otp = generateUserOtp(userId);
      const expiresAt = new Date(getOtpExpiryTimestamp()).toISOString();
      const baseUrl = resolveBaseUrl();
      const scriptUrl = `${baseUrl}/api/login.js`;
      const opaqueUserId = createLoginAuthorization(userId, game);
      const loginLink = `${cookieLogin.url}#otp=${otp}&user=${encodeURIComponent(opaqueUserId)}`;

      return {
        otp,
        scriptUrl,
        loginLink,
        loginPageUrl: loginPage.entryUrl,
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
      const { fetchSessions: fs } = await import('@/lib/db/schema-pg');

      const session = await db
        .select({ publicId: fs.publicId, startedAt: fs.startedAt })
        .from(fs)
        .where(
          and(
            eq(fs.game, ctx.game),
            eq(fs.userId, ctx.session.user.id),
            eq(fs.region, ctx.region)
          )
        )
        .orderBy(desc(fs.startedAt))
        .limit(1);

      return session.length > 0 ? { id: session[0].publicId, startedAt: session[0].startedAt } : null;
    }),

  deleteToken: gameProcedure(protectedProcedure, "scores")
    .mutation(async ({ ctx }) => {
      await deleteToken(ctx.game, ctx.session.user.id, ctx.region);
    }),
});
