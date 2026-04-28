import { protectedProcedure, publicProcedure, router } from '@/lib/trpc';
import { flagDefinitions } from '@/lib/flags';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import {
  fetchDivingFishRecordsByDevToken,
  fetchDivingFishRecordsByImportToken,
  DivingFishAuthError,
  DivingFishImportTokenError,
  DivingFishPrivacyError,
  DivingFishUserNotFoundError,
} from '@/lib/maimai/divingfish/client';
import {
  formatDivingFishToken,
  saveDivingFishToken,
} from '@/server/services/maimai-login';
import { generateUserOtp, getOtpExpiryTimestamp } from '@/lib/otp';
import { logger } from '@/lib/logger';
import { signCnProxyToken } from '@/lib/cn-proxy-token';
import { resolveBaseUrl } from '@/lib/base-url';

const DIVING_FISH_DISABLED_ERROR = new TRPCError({
  code: 'PRECONDITION_FAILED',
  message: 'diving-fish integration is temporarily disabled due to unstable connectivity.',
});

export const miscRouter = router({
  getUserSelectableFlags: publicProcedure
    .query(async () => {
      const selectableFlags: Record<string, any> = {};
      for (const [key, def] of Object.entries(flagDefinitions)) {
        if (def.userSelectable) {
          selectableFlags[key] = def;
        }
      }
      return { flags: selectableFlags };
    }),

  getLxnsOAuthConfigured: publicProcedure
    .query(async () => {
      return {
        configured: !!process.env.LXNS_CLIENT_ID && !!process.env.LXNS_CLIENT_SECRET,
      };
    }),

  getCnProxyConfigured: publicProcedure
    .query(async () => {
      const host = process.env.NEXT_PUBLIC_CN_PROXY_HOST ?? process.env.CN_PROXY_HOST ?? "";
      const port = process.env.NEXT_PUBLIC_CN_PROXY_PORT ?? process.env.CN_PROXY_PORT ?? "2560";
      return {
        configured: !!host && !!process.env.CN_PROXY_TOKEN_SECRET,
        host,
        port,
      };
    }),

  getCnProxyAuthLink: protectedProcedure
    .mutation(async ({ ctx }) => {
      // We only sign the token here; the actual wahlap authorize fetch +
      // redirect_uri rewrite happens lazily in the /cn-proxy/link route
      // handler so the URL we hand the user stays short.
      const token = signCnProxyToken(ctx.session.user.id);
      const url = `${resolveBaseUrl()}/cn-proxy/link?token=${encodeURIComponent(token)}`;
      logger.info(`[cn-proxy] generated auth link for user=${ctx.session.user.id}`);
      return { url };
    }),

  getDivingFishConfigured: publicProcedure
    .query(async () => {
      // diving-fish integration temporarily disabled; always report unconfigured.
      return {
        configured: false,
      };
    }),

  getDivingFishNicknameChallenge: protectedProcedure
    .query(({ ctx }): { challenge: string; expiresAt: string } => {
      throw DIVING_FISH_DISABLED_ERROR;
      // eslint-disable-next-line no-unreachable
      const otp = generateUserOtp(ctx.session.user.id);
      const expiresAt = new Date(getOtpExpiryTimestamp()).toISOString();
      return {
        challenge: `T${otp}`,
        expiresAt,
      };
    }),

  verifyDivingFishImportToken: protectedProcedure
    .input(z.object({
      importToken: z.string().min(1).max(256),
    }))
    .mutation(async ({ ctx, input }) => {
      throw DIVING_FISH_DISABLED_ERROR;
      // eslint-disable-next-line no-unreachable
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
        await saveDivingFishToken(ctx.session.user.id, formatted);
        logger.info(`[divingfish] verified via import-token for user=${ctx.session.user.id}, df_username=${username}`);
        // The Import-Token is intentionally not persisted anywhere, used only to confirm ownership.
        return { ok: true, username };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (error instanceof DivingFishImportTokenError) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid Import-Token.' });
        }
        logger.error({ error }, '[divingfish] import-token verification failed');
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to verify Import-Token. Please try again later.',
        });
      }
    }),

  verifyDivingFishNickname: protectedProcedure
    .input(z.object({
      kind: z.enum(['username', 'qq']),
      value: z.string().min(1).max(64),
    }))
    .mutation(async ({ ctx, input }) => {
      throw DIVING_FISH_DISABLED_ERROR;
      // eslint-disable-next-line no-unreachable
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
        await saveDivingFishToken(ctx.session.user.id, formatted);
        logger.info(`[divingfish] verified via nickname challenge for user=${ctx.session.user.id}, kind=${input.kind}`);
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
        logger.error({ error }, '[divingfish] nickname verification failed');
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to verify nickname. Please try again later.',
        });
      }
    }),

  getPolicies: publicProcedure
    .query(async () => {
      const tosPath = join(process.cwd(), 'public', 'tos');
      const privacyPath = join(process.cwd(), 'public', 'privacy');

      const [tosContent, privacyContent] = await Promise.all([
        readFile(tosPath, 'utf-8'),
        readFile(privacyPath, 'utf-8'),
      ]);

      return {
        tos: { content: tosContent },
        privacy: { content: privacyContent },
      };
    }),
});
