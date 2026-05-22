import { auth } from "@/lib/auth";
import { API_SCOPES, expandScopes, type ScopeKey } from "@/lib/api/scopes";
import { protectedProcedure, router } from "@/lib/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apikey, oauthClient, oauthConsent, oauthRefreshToken, oauthAccessToken } from "@/lib/db/schema-pg";
import { and, eq } from "drizzle-orm";
import { requireFreshSession } from "@/lib/security/fresh-session-server";
import { httpsRedirectUrl, safeWebUrl, httpsWebUrl } from "@/lib/security/oauth-url";
import { logger } from "@/lib/logger";

const scopeKey = z.enum(Object.keys(API_SCOPES) as [ScopeKey, ...ScopeKey[]]);

export const developerRouter = router({
  rotateApiKey: protectedProcedure
    .input(z.object({ keyId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      requireFreshSession(ctx.session);
      // Verify the key belongs to the current user and get its config
      const oldKey = await db.query.apikey.findFirst({
        where: and(eq(apikey.id, input.keyId), eq(apikey.referenceId, ctx.session.user.id)),
        columns: { name: true, permissions: true, expiresAt: true, enabled: true },
      });
      if (!oldKey) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Key not found" });
      }
      let permissions: Record<string, string[]> | undefined;
      try {
        permissions = oldKey.permissions
          ? (JSON.parse(oldKey.permissions) as Record<string, string[]>)
          : undefined;
      } catch {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Malformed key permissions" });
      }
      const expiresIn = oldKey.expiresAt
        ? Math.max(0, Math.floor((new Date(oldKey.expiresAt).getTime() - Date.now()) / 1000))
        : null;

      // Better Auth has no rotateApiKey — implement as delete + recreate
      await auth.api.deleteApiKey({
        body: { keyId: input.keyId },
      });

      const result = await auth.api.createApiKey({
        body: {
          userId: ctx.session.user.id,
          name: oldKey.name ?? undefined,
          permissions,
          expiresIn,
        },
      });

      if (!result?.key) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to rotate API key" });
      }

      if (!oldKey.enabled) {
        await auth.api.updateApiKey({
          body: { keyId: result.id, enabled: false },
        });
      }

      return { key: result.key };
    }),

  createApiKey: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(64),
        scopes: z.array(scopeKey).min(1),
        expiresIn: z.number().positive().optional(), // seconds
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Expand any encompassing scopes to their leaf scopes before storing.
      // This keeps verifyApiKey simple (pure AND logic, single Better Auth call).
      const leafScopes = expandScopes(input.scopes);
      const permissions = Object.fromEntries(
        leafScopes.map((s) => [s, ["access"]])
      );

      // Call without headers so Better Auth treats this as a server-side call,
      // which allows setting permissions and userId directly.
      const result = await auth.api.createApiKey({
        body: {
          userId: ctx.session.user.id,
          name: input.name,
          expiresIn: input.expiresIn ?? null,
          permissions,
        },
      });

      if (!result) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create API key" });
      }

      return { key: result.key };
    }),

  // ── OAuth Applications ────────────────────────────────────────────────────

  listOAuthApps: protectedProcedure
    .query(async ({ ctx }) => {
      const apps = await db
        .select({
          id: oauthClient.id,
          clientId: oauthClient.clientId,
          name: oauthClient.name,
          uri: oauthClient.uri,
          icon: oauthClient.icon,
          redirectUris: oauthClient.redirectUris,
          scopes: oauthClient.scopes,
          policy: oauthClient.policy,
          tos: oauthClient.tos,
          createdAt: oauthClient.createdAt,
          updatedAt: oauthClient.updatedAt,
        })
        .from(oauthClient)
        .where(eq(oauthClient.userId, ctx.session.user.id));
      return apps;
    }),

  createOAuthApp: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(64),
        redirectUris: z.array(httpsRedirectUrl).min(1).max(10),
        scopes: z.array(scopeKey).min(1),
        uri: safeWebUrl.optional(),
        icon: httpsWebUrl.optional(),
        policy: safeWebUrl.optional(),
        tos: safeWebUrl.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireFreshSession(ctx.session);
      // Delegate creation to Better Auth so it handles client_id generation,
      // secret hashing, and any internal bookkeeping consistently.
      const result = await auth.api.createOAuthClient({
        body: {
          client_name: input.name,
          redirect_uris: input.redirectUris,
          scope: expandScopes(input.scopes).join(" "),
          client_uri: input.uri,
          logo_uri: input.icon,
          policy_uri: input.policy,
          tos_uri: input.tos,
          token_endpoint_auth_method: "client_secret_basic",
          grant_types: ["authorization_code"],
          response_types: ["code"],
        },
        headers: ctx.req.headers,   // carry the session cookie so BA's sessionMiddleware is happy
      });

      if (!result) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create OAuth application" });
      }

      // After creation, link the app to the user in the DB.
      // Better Auth's createOAuthClient endpoint may not set userId automatically
      // when the user is identified only via session cookie, so we patch it here.
      // If the patch fails, compensate by deleting the orphan client so we don't
      // leave an owner-less but still-functional OAuth client behind (we cannot
      // share a Drizzle transaction with Better Auth's adapter).
      try {
        await db
          .update(oauthClient)
          .set({ userId: ctx.session.user.id })
          .where(eq(oauthClient.clientId, (result as any).client_id));
      } catch (err) {
        const clientId = (result as any).client_id;
        await auth.api.deleteOAuthClient({
          body: { client_id: clientId },
          headers: ctx.req.headers,
        }).catch((compensationErr) => {
          logger.error(
            { clientId, userId: ctx.session.user.id, originalErr: err, compensationErr },
            "Failed to delete orphan OAuth client after userId patch failure",
          );
        });
        throw err;
      }

      return result as { client_id: string; client_secret: string; [key: string]: unknown };
    }),

  updateOAuthApp: protectedProcedure
    .input(
      z.object({
        clientId: z.string(),
        name: z.string().min(1).max(64).optional(),
        redirectUris: z.array(httpsRedirectUrl).min(1).max(10).optional(),
        uri: safeWebUrl.optional().nullable(),
        icon: httpsWebUrl.optional().nullable(),
        policy: safeWebUrl.optional().nullable(),
        tos: safeWebUrl.optional().nullable(),
        scopes: z.array(scopeKey).min(1).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Redirect-URI changes can re-target the OAuth flow at an attacker-controlled
      // endpoint, so require a fresh session for them. Pure metadata edits (name,
      // icon, policy/tos) are lower-risk and stay session-only.
      if (input.redirectUris) requireFreshSession(ctx.session);
      // Verify ownership
      const [app] = await db
        .select({ id: oauthClient.id })
        .from(oauthClient)
        .where(and(eq(oauthClient.clientId, input.clientId), eq(oauthClient.userId, ctx.session.user.id)));
      if (!app) throw new TRPCError({ code: "FORBIDDEN", message: "App not found" });

      const result = await auth.api.updateOAuthClient({
        body: {
          client_id: input.clientId,
          update: {
            ...(input.redirectUris && { redirect_uris: input.redirectUris }),
            ...(input.name !== undefined && { client_name: input.name }),
            ...(input.uri !== undefined && { client_uri: input.uri ?? undefined }),
            ...(input.icon !== undefined && { logo_uri: input.icon ?? undefined }),
            ...(input.policy !== undefined && { policy_uri: input.policy ?? undefined }),
            ...(input.tos !== undefined && { tos_uri: input.tos ?? undefined }),
            ...(input.scopes && { scope: expandScopes(input.scopes).join(" ") }),
          },
        },
        headers: ctx.req.headers,
      });

      if (!result) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to update OAuth application" });
      return result;
    }),

  deleteOAuthApp: protectedProcedure
    .input(z.object({ clientId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      requireFreshSession(ctx.session);
      const [app] = await db
        .select({ id: oauthClient.id })
        .from(oauthClient)
        .where(and(eq(oauthClient.clientId, input.clientId), eq(oauthClient.userId, ctx.session.user.id)));
      if (!app) throw new TRPCError({ code: "FORBIDDEN", message: "App not found" });

      await auth.api.deleteOAuthClient({
        body: { client_id: input.clientId },
        headers: ctx.req.headers,
      });
    }),

  rotateOAuthSecret: protectedProcedure
    .input(z.object({ clientId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      requireFreshSession(ctx.session);
      const [app] = await db
        .select({ id: oauthClient.id })
        .from(oauthClient)
        .where(and(eq(oauthClient.clientId, input.clientId), eq(oauthClient.userId, ctx.session.user.id)));
      if (!app) throw new TRPCError({ code: "FORBIDDEN", message: "App not found" });

      const result = await auth.api.rotateClientSecret({
        body: { client_id: input.clientId },
        headers: ctx.req.headers,
      });

      if (!result) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to rotate client secret" });
      return result as { client_secret: string; [key: string]: unknown };
    }),

  // ── User OAuth Authorizations ──────────────────────────────────────────────

  listOAuthAuthorizations: protectedProcedure
    .query(async ({ ctx }) => {
      const rows = await db
        .select({
          consentId: oauthConsent.id,
          clientId: oauthConsent.clientId,
          scopes: oauthConsent.scopes,
          createdAt: oauthConsent.createdAt,
          updatedAt: oauthConsent.updatedAt,
          appName: oauthClient.name,
          appIcon: oauthClient.icon,
          appUri: oauthClient.uri,
        })
        .from(oauthConsent)
        .innerJoin(oauthClient, eq(oauthConsent.clientId, oauthClient.clientId))
        .where(eq(oauthConsent.userId, ctx.session.user.id));
      return rows;
    }),

  revokeOAuthAuthorization: protectedProcedure
    .input(z.object({ clientId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [consent] = await db
        .select({ id: oauthConsent.id })
        .from(oauthConsent)
        .where(and(eq(oauthConsent.clientId, input.clientId), eq(oauthConsent.userId, ctx.session.user.id)));
      if (!consent) throw new TRPCError({ code: "NOT_FOUND", message: "Authorization not found" });

      // Revoke all active tokens for this user+client pair, then delete consent.
      // Wrapped in a single transaction so a partial failure can't leave dangling
      // access tokens after the refresh token / consent are already gone.
      await db.transaction(async (tx) => {
        await tx
          .delete(oauthAccessToken)
          .where(and(eq(oauthAccessToken.clientId, input.clientId), eq(oauthAccessToken.userId, ctx.session.user.id)));
        await tx
          .delete(oauthRefreshToken)
          .where(and(eq(oauthRefreshToken.clientId, input.clientId), eq(oauthRefreshToken.userId, ctx.session.user.id)));
        await tx
          .delete(oauthConsent)
          .where(and(eq(oauthConsent.clientId, input.clientId), eq(oauthConsent.userId, ctx.session.user.id)));
      });
    }),
});
