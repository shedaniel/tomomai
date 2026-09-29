import { protectedProcedure, publicProcedure, router } from '@/lib/trpc';
import { z } from 'zod';
import { getLogger } from '@/lib/request-logger';
import { TRPCError } from '@trpc/server';
import {
  fetchDivingFishRecordsByDevToken,
  fetchDivingFishRecordsByImportToken,
  DivingFishAuthError,
  DivingFishImportTokenError,
  DivingFishPrivacyError,
  DivingFishUserNotFoundError,
} from '@/server/services/games/maimai/scores/divingfish/client';
import {
  formatDivingFishToken,
} from '@/server/services/games/maimai/login';
import { saveToken } from '@/server/services/games/tokens';
import { maimaiProcedure } from './procedures';
import { generateUserOtp, getOtpExpiryTimestamp } from '@/lib/otp';
import { signCnProxyToken } from '@/server/services/games/maimai/cn-proxy-token';
import { resolveBaseUrl } from '@/lib/base-url';

const DIVING_FISH_DISABLED_ERROR = new TRPCError({
  code: 'PRECONDITION_FAILED',
  message: 'diving-fish integration is temporarily disabled due to unstable connectivity.',
});

export const providersRouter = router({
  getLxnsOAuthConfigured: maimaiProcedure(publicProcedure, "scores")
    .query(async () => {
      return {
        configured: !!process.env.LXNS_CLIENT_ID && !!process.env.LXNS_CLIENT_SECRET,
      };
    }),

  getCnProxyConfigured: maimaiProcedure(publicProcedure, "scores")
    .query(async () => {
      const host = process.env.NEXT_PUBLIC_CN_PROXY_HOST ?? process.env.CN_PROXY_HOST ?? "";
      const port = process.env.NEXT_PUBLIC_CN_PROXY_PORT ?? process.env.CN_PROXY_PORT ?? "2560";
      return {
        configured: !!host && !!process.env.CN_PROXY_TOKEN_SECRET,
        host,
        port,
      };
    }),

  getCnProxyAuthLink: maimaiProcedure(protectedProcedure, "scores")
    .mutation(async ({ ctx }) => {
      // We only sign the token here; the actual wahlap authorize fetch +
      // redirect_uri rewrite happens lazily in the /cn-proxy/link route
      // handler so the URL we hand the user stays short.
      const token = signCnProxyToken(ctx.session.user.id);
      const url = `${resolveBaseUrl()}/cn-proxy/link?token=${encodeURIComponent(token)}`;
      getLogger().info({ userId: ctx.session.user.id }, "Generated a CN proxy auth link");
      return { url };
    }),

  getDivingFishConfigured: maimaiProcedure(publicProcedure, "scores")
    .query(async () => {
      // diving-fish integration temporarily disabled; always report unconfigured.
      return {
        configured: false,
      };
    }),

  getDivingFishNicknameChallenge: maimaiProcedure(protectedProcedure, "scores")
    .query(({ ctx }): { challenge: string; expiresAt: string } => {
      throw DIVING_FISH_DISABLED_ERROR;
      const otp = generateUserOtp(ctx.session.user.id);
      const expiresAt = new Date(getOtpExpiryTimestamp()).toISOString();
      return {
        challenge: `T${otp}`,
        expiresAt,
      };
    }),

  verifyDivingFishImportToken: maimaiProcedure(protectedProcedure, "scores")
    .input(z.object({
      importToken: z.string().min(1).max(256),
    }))
    .mutation(async ({ ctx, input }) => {
      throw DIVING_FISH_DISABLED_ERROR;
      try {
        const response = await fetchDivingFishRecordsByImportToken(input.importToken);
        const username = response.username;
        if (!username) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'diving-fish response did not include a username.',
          });
        }
        const formatted = formatDivingFishToken({ kind: 'username', value: username as string });
        await saveToken(ctx.game, ctx.session.user.id, "cn", formatted);
        getLogger().info({ userId: ctx.session.user.id }, "Verified a diving-fish account by import token");
        // The Import-Token is intentionally not persisted anywhere, used only to confirm ownership.
        return { ok: true, username };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (error instanceof DivingFishImportTokenError) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid Import-Token.' });
        }
        getLogger().error({ err: error, userId: ctx.session.user.id }, "diving-fish import token verification failed");
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to verify Import-Token. Please try again later.',
        });
      }
    }),

  verifyDivingFishNickname: maimaiProcedure(protectedProcedure, "scores")
    .input(z.object({
      kind: z.enum(['username', 'qq']),
      value: z.string().min(1).max(64),
    }))
    .mutation(async ({ ctx, input }) => {
      throw DIVING_FISH_DISABLED_ERROR;
      if (!process.env.DIVINGFISH_DEV_TOKEN) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'diving-fish is not configured on the server.',
        });
      }
      const expected = `T${generateUserOtp(ctx.session.user.id)}`;
      try {
        const response = await fetchDivingFishRecordsByDevToken(input);
        if (response.nickname !== expected) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Nickname does not match the verification code yet. Save your diving-fish nickname change and retry.',
          });
        }
        const formatted = formatDivingFishToken(input);
        await saveToken(ctx.game, ctx.session.user.id, "cn", formatted);
        getLogger().info({ userId: ctx.session.user.id }, "Verified a diving-fish account by nickname challenge");
        return { ok: true };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (error instanceof DivingFishUserNotFoundError) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'No such diving-fish user.' });
        }
        if (error instanceof DivingFishPrivacyError) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Account has privacy enabled or has not accepted the user agreement on diving-fish.',
          });
        }
        if (error instanceof DivingFishAuthError) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'diving-fish server configuration error. Please contact the administrator.',
          });
        }
        getLogger().error({ err: error, userId: ctx.session.user.id }, "diving-fish nickname verification failed");
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to verify nickname. Please try again later.',
        });
      }
    }),
});
