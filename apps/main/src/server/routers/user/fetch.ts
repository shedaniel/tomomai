import { db } from '@/lib/db';
import { generateUserOtp, getOtpExpiryTimestamp, createOpaqueUserId } from '@/lib/otp';
import { resolveBaseUrl } from '@/lib/base-url';
import { getFetchStatusServer, startFetchServer } from '@/lib/maimai-server-actions';
import { getLogger } from '@/lib/request-logger';
import { protectedProcedure, router } from '@/lib/trpc';
import { Region } from '@/lib/types';
import { TRPCError } from '@trpc/server';
import { isTokenError, isAlbumSettingsError } from '@/lib/token-errors';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getEnabledRegions } from '@/lib/enabled-regions';

const regionSchema = z.enum(getEnabledRegions());

export const fetchRouter = router({
  getLoginOtp: protectedProcedure
    .query(({ ctx }) => {
      const userId = ctx.session.user.id;
      const otp = generateUserOtp(userId);
      const expiresAt = new Date(getOtpExpiryTimestamp()).toISOString();
      const baseUrl = resolveBaseUrl();
      const scriptUrl = `${baseUrl}/api/login.js`;
      const opaqueUserId = createOpaqueUserId(userId);
      const loginLink = `https://lng-tgk-aime-gw.am-all.net/common_auth/#otp=${otp}&user=${encodeURIComponent(opaqueUserId)}`;

      return {
        otp,
        scriptUrl,
        loginLink,
        expiresAt,
      };
    }),

  startFetch: protectedProcedure
    .input(z.object({
      region: regionSchema,
      token: z.string().optional(),
      flags: z.string().array().default([]),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await startFetchServer(ctx.session.user.id, input.region as Region, input.token, input.flags);
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
    .input(z.object({
      region: regionSchema,
    }))
    .query(async ({ ctx, input }) => {
      return await getFetchStatusServer(ctx.session.user.id, input.region as Region);
    }),

  getLatestFetchSessionId: protectedProcedure
    .input(z.object({
      region: regionSchema,
    }))
    .query(async ({ ctx, input }) => {
      const { fetchSessions: fs } = await import('@/lib/db/schema-pg');

      const session = await db
        .select({ publicId: fs.publicId, startedAt: fs.startedAt })
        .from(fs)
        .where(
          and(
            eq(fs.userId, ctx.session.user.id),
            eq(fs.region, input.region)
          )
        )
        .orderBy(desc(fs.startedAt))
        .limit(1);

      return session.length > 0 ? { id: session[0].publicId, startedAt: session[0].startedAt } : null;
    }),

  deleteToken: protectedProcedure
    .input(z.object({
      region: regionSchema,
    }))
    .mutation(async ({ ctx, input }) => {
      const { deleteToken } = await import('@/server/services/maimai-login');
      await deleteToken(ctx.session.user.id, input.region as Region);
    }),
});
