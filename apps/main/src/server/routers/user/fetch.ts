import { getGameSite } from "@/lib/games/sites";
import { GAME_REGISTRY } from "@/lib/games/registry";
import { gameIdSchema } from "@/lib/games/schema";
import { gameContextInput, validateGameCapability, validateGameInput } from "./game-input";
import { startScoreFetch, getScoreFetchStatus } from "@/server/services/games/score-ingestion";
import { db } from '@/lib/db';
import { generateUserOtp, getOtpExpiryTimestamp, createLoginAuthorization } from '@/lib/otp';
import { requireConfiguredSource } from "@/server/services/games/adapters";
import { deleteToken } from "@/server/services/games/tokens";
import { resolveBaseUrl } from '@/lib/base-url';
import { getLogger } from '@/lib/request-logger';
import { protectedProcedure, router } from '@/lib/trpc';
import { TRPCError } from '@trpc/server';
import { isTokenError, isAlbumSettingsError } from '@/lib/token-errors';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';

export const fetchRouter = router({
  getLoginOtp: protectedProcedure
    .input(z.object({ game: gameIdSchema }))
    .query(({ ctx, input }) => {
      requireConfiguredSource(input.game, "scores");
      validateGameCapability(input.game, "scores");
      const { cookieLogin } = GAME_REGISTRY[input.game].adapter.fetch;
      if (!cookieLogin) throw new TRPCError({ code: "BAD_REQUEST", message: "Cookie login is not available for this game" });
      const userId = ctx.session.user.id;
      const otp = generateUserOtp(userId);
      const expiresAt = new Date(getOtpExpiryTimestamp()).toISOString();
      const baseUrl = resolveBaseUrl();
      const scriptUrl = `${baseUrl}/api/login.js`;
      const opaqueUserId = createLoginAuthorization(userId, input.game);
      const loginLink = `${cookieLogin.url}#otp=${otp}&user=${encodeURIComponent(opaqueUserId)}`;

      return {
        otp,
        scriptUrl,
        loginLink,
        loginPageUrl: getGameSite(input.game, cookieLogin.region)!.entryUrl,
        expiresAt,
      };
    }),

  startFetch: protectedProcedure
    .input(z.object({ ...gameContextInput,
      token: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const context = validateGameInput(input, "scores");
        return await startScoreFetch({ ...context, userId: ctx.session.user.id, token: input.token });
      } catch (error) {
        if (error instanceof Error) {
          if (isAlbumSettingsError(error.message)) {
            throw new TRPCError({
              code: 'PRECONDITION_FAILED',
              message: error.message,
            });
          } else if (isTokenError(error.message)) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: error.message,
            });
          } else if (error.message.includes('already in progress')) {
            throw new TRPCError({
              code: 'CONFLICT',
              message: error.message,
            });
          } else if (error.message.includes('Rate limited')) {
            throw new TRPCError({
              code: 'TOO_MANY_REQUESTS',
              message: error.message,
            });
          }
        }
        getLogger().error({ err: error }, 'Failed to start fetch');
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to start fetch',
        });
      }
    }),

  getFetchStatus: protectedProcedure
    .input(z.object(gameContextInput))
    .query(({ ctx, input }) => {
      const context = validateGameInput(input, "scores");
      return getScoreFetchStatus({ ...context, userId: ctx.session.user.id });
    }),

  getLatestFetchSessionId: protectedProcedure
    .input(z.object(gameContextInput))
    .query(async ({ ctx, input }) => {
      validateGameInput(input, "scores");
      const { fetchSessions: fs } = await import('@/lib/db/schema-pg');

      const session = await db
        .select({ publicId: fs.publicId, startedAt: fs.startedAt })
        .from(fs)
        .where(
          and(
            eq(fs.game, input.game),
            eq(fs.userId, ctx.session.user.id),
            eq(fs.region, input.region)
          )
        )
        .orderBy(desc(fs.startedAt))
        .limit(1);

      return session.length > 0 ? { id: session[0].publicId, startedAt: session[0].startedAt } : null;
    }),

  deleteToken: protectedProcedure
    .input(z.object(gameContextInput))
    .mutation(async ({ ctx, input }) => {
      const { game, region } = validateGameInput(input, "scores");
      await deleteToken(game, ctx.session.user.id, region);
    }),
});
