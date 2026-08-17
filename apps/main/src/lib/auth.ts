import { betterAuth } from "better-auth";
import { resolveBaseUrl, stripSubdomains } from "@/lib/base-url";
import { createAuthMiddleware, APIError, getSessionFromCtx } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { admin, jwt, openAPI } from "better-auth/plugins";
import { apiKey } from "@better-auth/api-key";
import { passkey } from "@better-auth/passkey";
import { oauthProvider } from "@better-auth/oauth-provider";
import { API_SCOPES, isInternalScope } from "@/lib/api/scopes";
import { and, count, eq, isNull, lt, or } from "drizzle-orm";
import { db } from "./db";
import * as schema from "./db/schema-pg";
import { logger } from "@/lib/logger";
import { consumeAltchaPayload } from "@/lib/altcha";
import { clientIpFromHeaders, passkeyRegisterLimiter } from "@/lib/security/redis-rate-limit";
import { isSessionFresh } from "@/lib/security/fresh-session";
import { isSafeRedirectUrl, isSafeWebUrl, isHttpsUrl } from "@/lib/security/oauth-url";
import { mirrorRemoteAvatarToR2, isR2AvatarUrl } from "@/lib/r2";
import { useApiKeyCreation, useOauthAppCreation } from "@/lib/flags";
import { getCurrentLegalVersions } from "@/lib/legal";
import { getAcceptedPolicyVersions } from "@/lib/legal-acceptance";
import { NEW_POLICY_REQUIRED_CODE } from "@/lib/security/policy-gate";

async function mirrorAvatarForSignup(
  rawUrl: string | null | undefined,
  userIdForLog: string,
): Promise<string | null> {
  if (!rawUrl) return null;
  if (isR2AvatarUrl(rawUrl)) return rawUrl;
  let result = await mirrorRemoteAvatarToR2(rawUrl);
  if (result.url === null && result.reason === "transient") {
    result = await mirrorRemoteAvatarToR2(rawUrl);
  }
  logger.info(
    { userId: userIdForLog, oldUrl: rawUrl, newUrl: result.url, reason: result.reason ?? "ok" },
    "auth.signup.avatar-mirror",
  );
  return result.url;
}

// Self-healing: when a user with image=null signs in, ask the provider for their
// current avatar and mirror it. Users whose original avatar was dead at signup
// (or whose backfill nulled them) recover by simply logging in again.
async function fetchProviderAvatarUrl(
  providerId: string,
  accessToken: string,
): Promise<string | null> {
  try {
    if (providerId === "discord") {
      const res = await fetch("https://discord.com/api/users/@me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return null;
      const profile = (await res.json()) as { id?: string; avatar?: string | null };
      if (!profile.id || !profile.avatar) return null;
      const ext = profile.avatar.startsWith("a_") ? "gif" : "png";
      return `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.${ext}`;
    }
    if (providerId === "twitter") {
      const res = await fetch("https://api.twitter.com/2/users/me?user.fields=profile_image_url", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return null;
      const json = (await res.json()) as { data?: { profile_image_url?: string } };
      // Twitter returns the `_normal` (48x48) variant by default; bump to 400x400.
      return json.data?.profile_image_url?.replace("_normal.", "_400x400.") ?? null;
    }
  } catch {
    // network failure → treat as missing
  }
  return null;
}

async function refreshAvatarIfMissing(userId: string): Promise<void> {
  const [row] = await db
    .select({ image: schema.user.image })
    .from(schema.user)
    .where(eq(schema.user.id, userId))
    .limit(1);
  if (!row || row.image) return;

  const [acct] = await db
    .select({ providerId: schema.account.providerId, accessToken: schema.account.accessToken })
    .from(schema.account)
    .where(
      and(
        eq(schema.account.userId, userId),
        or(eq(schema.account.providerId, "discord"), eq(schema.account.providerId, "twitter")),
      ),
    )
    .orderBy(schema.account.updatedAt)
    .limit(1);
  if (!acct?.accessToken) return;

  const remoteUrl = await fetchProviderAvatarUrl(acct.providerId, acct.accessToken);
  if (!remoteUrl) {
    logger.info({ userId, providerId: acct.providerId }, "auth.signin.avatar-refresh-no-remote");
    return;
  }

  const result = await mirrorRemoteAvatarToR2(remoteUrl);
  if (!result.url) {
    logger.info(
      { userId, providerId: acct.providerId, remoteUrl, reason: result.reason },
      "auth.signin.avatar-refresh-failed",
    );
    return;
  }

  await db.update(schema.user).set({ image: result.url }).where(eq(schema.user.id, userId));
  logger.info(
    { userId, providerId: acct.providerId, newUrl: result.url },
    "auth.signin.avatar-refresh-ok",
  );
}

// Sensitive Better Auth routes that grant lasting account / client takeover power
// (secret rotation, redirect URI edits, account linking). Gated by fresh-session
// check so a stolen cookie alone cannot escalate without re-authentication.
const FRESH_REQUIRED_PATHS = new Set<string>([
  "/oauth2/create-client",
  "/oauth2/update-client",
  "/oauth2/client/rotate-secret",
  "/oauth2/delete-client",
  "/api-key/create",
  "/api-key/delete",
  "/api-key/update",
  "/link-social",
  "/unlink-account",
  // Passkey mutations: stolen session must not be able to silently mint or
  // strip a user's WebAuthn credentials. Registration goes through both option
  // generation and verification — both fresh-gated. Captcha gates automation,
  // not stale cookies. BA's own freshSessionMiddleware uses a 24h default
  // freshAge; our 5-min FRESH_REQUIRED_PATHS check fires first in hooks.before.
  "/passkey/generate-register-options",
  "/passkey/verify-registration",
  "/passkey/delete-passkey",
  "/passkey/update-passkey",
  // Session revocation: kicking other devices is escalation territory once a
  // stolen cookie has access (combined with a planted passkey it fully evicts
  // the legitimate owner). /sign-out is intentionally NOT here so users can
  // always end the current session even after reauth itself fails.
  "/revoke-session",
  "/revoke-other-sessions",
]);

// Routes that require the user to have accepted a specific (newer) policy
// version before proceeding. Enforced server-side regardless of caller; the
// client catches NEW_POLICY_REQUIRED and launches the consent dialog. Versions
// are "YYYYMMDD" strings, compared lexicographically (chronological).
const POLICY_REQUIRED_PATHS: Record<string, { tos: string; privacy: string }> = {
  "/passkey/generate-register-options": { tos: "20260630", privacy: "20260630" },
  "/passkey/verify-registration": { tos: "20260630", privacy: "20260630" },
  "/link-social": { tos: "20260630", privacy: "20260630" },
};

// OAuth client mutation paths. Gated by the `oauthAppCreation` flag until
// v1 ships — UI may render, but no client can be created, rotated, or
// destroyed via tRPC or direct BA HTTP.
const OAUTH_APP_BA_PATHS = new Set<string>([
  "/oauth2/create-client",
  "/oauth2/update-client",
  "/oauth2/client/rotate-secret",
  "/oauth2/delete-client",
]);

// API key mutation paths. Gated by the `apiKeyCreation` flag.
const API_KEY_BA_PATHS = new Set<string>([
  "/api-key/create",
  "/api-key/delete",
  "/api-key/update",
]);

// Passkey endpoints that mint a new credential, must be captcha-gated to prevent
// scripted abuse. Sign-in / authenticate paths are intentionally NOT gated.
const CAPTCHA_GATED_PATHS = new Set([
  "/passkey/generate-register-options",
]);

const SIGNUP_TYPE = process.env.NEXT_PUBLIC_ACCOUNT_SIGNUP_TYPE || 'disabled'; // disabled, invite-only, enabled
const SIGNUP_REQUIRED_AMOUNT = 128;
// Helper function to check if invites are required based on user count
async function checkInviteRequirement(): Promise<boolean> {
  if (SIGNUP_TYPE !== 'invite-only') {
    return SIGNUP_TYPE === 'disabled'; // Always require invite if disabled, never if enabled
  }

  // For invite-only mode, check user count
  const [userCount] = await db
    .select({ count: count() })
    .from(schema.user);

  return userCount.count >= SIGNUP_REQUIRED_AMOUNT;
}

// Helper function to validate and claim invitations
async function validateAndClaimInvite(inviteCode: string, userId: string) {
  const now = new Date();

  // Auto-cleanup old/revoked/expired invites
  try {
    await db
      .delete(schema.invites)
      .where(
        or(
          eq(schema.invites.revoked, true),
          and(
            lt(schema.invites.expiresAt, now),
            isNull(schema.invites.claimedBy)
          )
        )
      );
  } catch (error) {
    logger.error({ err: error, context: "auto-cleanup" }, "Auto-cleanup failed");
  }

  // Find the invitation
  const [invite] = await db
    .select({
      id: schema.invites.id,
      code: schema.invites.code,
      createdBy: schema.invites.createdBy,
      claimedBy: schema.invites.claimedBy,
      createdAt: schema.invites.createdAt,
      expiresAt: schema.invites.expiresAt,
      revoked: schema.invites.revoked,
    })
    .from(schema.invites)
    .where(eq(schema.invites.code, inviteCode))
    .limit(1);

  if (!invite) {
    throw new Error("Invalid invitation code");
  }

  // Check if invitation is valid
  if (invite.revoked) {
    throw new Error("This invitation has been revoked");
  }

  if (invite.claimedBy) {
    throw new Error("This invitation has already been used");
  }

  if (new Date(invite.expiresAt) <= now) {
    throw new Error("This invitation has expired");
  }

  // Check for self-claiming
  if (invite.createdBy === userId) {
    throw new Error("You cannot use your own invitation code");
  }

  // Claim the invitation
  await db
    .update(schema.invites)
    .set({
      claimedBy: userId,
      claimedAt: now,
    })
    .where(eq(schema.invites.id, invite.id));

  return invite;
}

// --- Multi-hostname config (e.g. tomomai.lol + cn.tomomai.lol via the HK
// proxy in cn/) is driven by env vars so the same code works across
// deployments without per-domain edits. See cn/README.md.
//
// TRUSTED_ORIGINS:    comma-separated origins allowed for OAuth callbacks /
//                     CORS. Falls back to unset → Better Auth's default
//                     (single-origin, derived from request host).
// AUTH_COOKIE_DOMAIN: cookie domain for cross-subdomain sessions (e.g.
//                     ".tomomai.lol" so cn.tomomai.lol shares sessions with
//                     the apex). Omit for single-hostname deployments.
const trustedOrigins = (process.env.TRUSTED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const authCookieDomain = process.env.AUTH_COOKIE_DOMAIN?.trim() || undefined;

const authSecret = (() => {
  const v = process.env.BETTER_AUTH_SECRET;
  if (v) return v;
  if (process.env.NODE_ENV !== "development") {
    throw new Error("BETTER_AUTH_SECRET is required in non-development environments");
  }
  return "development-secret-change-in-production";
})();

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL || resolveBaseUrl(),
  ...(trustedOrigins.length ? { trustedOrigins } : {}),
  advanced: {
    // Honour x-forwarded-host / x-forwarded-proto when computing the base
    // URL Better Auth uses for OAuth redirect_uri, cookie domain inference,
    // etc. Without this, Better Auth falls back to `request.url` — which in
    // local `pnpm dev` is http://localhost:3000 even when the request came
    // in via the cn/ HK proxy (or via cloudflared tunnel during e2e dev),
    // breaking Discord login by sending users back to localhost. Vercel
    // and the cn/ Caddy both set these headers, so trusting them is safe
    // — there is no path where an untrusted client can reach the app
    // without going through one of them.
    trustedProxyHeaders: true,
    ipAddress: {
      ipAddressHeaders: [
        "x-vercel-forwarded-for",
        "cf-connecting-ip",
        "x-forwarded-for",
        "x-real-ip",
      ],
    },
    ...(authCookieDomain
      ? {
        crossSubDomainCookies: { enabled: true, domain: authCookieDomain },
        defaultCookieAttributes: {
          domain: authCookieDomain,
          sameSite: "lax",
          secure: true,
        },
      }
      : {}),
  },
  emailAndPassword: {
    enabled: false,
  },
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  secret: authSecret,
  socialProviders: {
    discord: {
      clientId: process.env.DISCORD_CLIENT_ID as string,
      clientSecret: process.env.DISCORD_CLIENT_SECRET as string,
      disableImplicitSignUp: true,
    },
    twitter: {
      clientId: process.env.TWITTER_CLIENT_ID as string,
      clientSecret: process.env.TWITTER_CLIENT_SECRET as string,
      disableImplicitSignUp: true,
    },
  },
  account: {
    accountLinking: {
      enabled: true,
      // Blocks the signup-callback auto-merge by email; explicit /link-social still works.
      trustedProviders: ["discord"],
      disableImplicitLinking: true,
    },
  },
  plugins: [
    admin(),
    apiKey({
      enableMetadata: true,
      defaultPrefix: "tmk_",
      startingCharactersConfig: { shouldStore: true, charactersLength: 8 },
      permissions: {
        defaultPermissions: { ready: ["access"] },
      },
    }),
    passkey({
      // Pinned to the registrable apex so credentials roam across subdomains.
      rpID: stripSubdomains(process.env.BETTER_AUTH_URL || resolveBaseUrl()),
      rpName: "tomomai",
    }),
    jwt(),
    oauthProvider({
      loginPage: "/",
      consentPage: "/oauth/consent",
      accessTokenExpiresIn: 3600,       // 1 hour
      refreshTokenExpiresIn: 2592000,   // 30 days
      // `scopes` is the canonical list the provider understands.
      // `clientRegistrationAllowedScopes` restricts what clients may request —
      // every entry here must also appear in `scopes`.
      scopes: Object.keys(API_SCOPES) as string[],
      clientRegistrationAllowedScopes: Object.keys(API_SCOPES) as string[],
      // Declare the site root as a valid audience so OAuth clients can request
      // JWT-signed access tokens via `resource=<baseUrl>` (RFC 8707). Without
      // this entry, Better Auth's default `validAudiences` is just
      // `${baseURL}/api/auth` (its own mount), which is awkward to use as the
      // API audience. We can add more (e.g. an `api.tomomai.lol` host or
      // per-MCP audiences) as the surface grows.
      validAudiences: [process.env.BETTER_AUTH_URL || resolveBaseUrl()],
    }),
    ...(process.env.NODE_ENV === 'development' ? [openAPI()] : []),
    nextCookies(),
  ],
  disabledPaths: [
    // Password / email-credential flows — emailAndPassword is disabled.
    "/reset-password",
    "/reset-password/{token}",
    "/change-password",
    "/change-email",
    "/verify-email",
    "/send-verification-email",
    "/request-password-reset",
    "/sign-up/email",
    "/sign-in/email",
    "/verify-password",
    "/delete-user",
    "/delete-user/callback",
    // Profile mutations not exposed in UI; otherwise stolen session could rename the user.
    "/update-user",
    // Session mutations not used: /update-session is never called, and the
    // sessions UI uses revokeSession/revokeOtherSessions — /revoke-sessions
    // (bulk by token list) has no call site. /list-sessions and the two
    // single/other revoke endpoints stay open for the settings UI.
    "/update-session",
    "/revoke-sessions",
    // TODO(v2026.5): Disable feature until release
    "/oauth2/introspect",
    // Social-provider token passthrough — we never expose Discord/Twitter
    // tokens to clients, so close these to avoid future foot-guns.
    "/refresh-token",
    "/get-access-token",
    "/account-info",
    // OAuth provider surface we don't use:
    // - /oauth2/register is BA's RFC 7591 dynamic client registration. It's
    //   already gated behind allowDynamicClientRegistration:false (returns
    //   FORBIDDEN), but disable explicitly so flipping that flag can't
    //   accidentally expose an unauthenticated client-registration endpoint
    //   with no scheme validation on metadata URLs.
    // - /oauth2/end-session is OIDC RP-initiated logout; not wired up.
    "/oauth2/register",
    "/oauth2/end-session",
    // Admin plugin is registered (for the `role` column) but no client or
    // server code calls these endpoints. Disable until an admin UI exists,
    // so a future role=admin user can't accidentally escalate via direct HTTP.
    "/admin/set-role",
    "/admin/get-user",
    "/admin/create-user",
    "/admin/update-user",
    "/admin/list-users",
    "/admin/list-user-sessions",
    "/admin/unban-user",
    "/admin/ban-user",
    "/admin/impersonate-user",
    "/admin/stop-impersonating",
    "/admin/revoke-user-session",
    "/admin/revoke-user-sessions",
    "/admin/remove-user",
    "/admin/set-user-password",
    "/admin/has-permission",
  ],
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      // Internal scopes (API_SCOPES[s].internal === true) may only be minted by
      // admin-role users. BA's clientRegistrationAllowedScopes includes every
      // key in API_SCOPES; without this check, any logged-in user could
      // register a client carrying e.g. `snapshot:submit` via direct HTTP, or
      // a non-admin could consent to such a scope if a client were
      // misregistered. Sentinel-style message so a client-side detector can
      // match exactly without substring drift. Shared between
      // /oauth2/{create,update}-client and /oauth2/consent.
      const rejectInternalScopesForNonAdmin = async (scopes: readonly string[]) => {
        if (!scopes.some(isInternalScope)) return;
        const s = await getSessionFromCtx(ctx);
        if (s?.user?.role !== "admin") {
          throw new APIError("FORBIDDEN", { message: "INTERNAL_SCOPE_FORBIDDEN" });
        }
      };


      if (OAUTH_APP_BA_PATHS.has(ctx.path) && !(await useOauthAppCreation())) {
        throw new APIError("NOT_FOUND", { message: "Not Found" });
      }
      if (API_KEY_BA_PATHS.has(ctx.path) && !(await useApiKeyCreation())) {
        throw new APIError("NOT_FOUND", { message: "Not Found" });
      }

      // New-policy gate. Checked BEFORE the fresh-session gate so the user
      // accepts the updated policy (no navigation) before any reauth bounce
      // (which navigates away). Applies regardless of caller.
      const requiredPolicy = POLICY_REQUIRED_PATHS[ctx.path];
      if (requiredPolicy) {
        const session = await getSessionFromCtx(ctx);
        if (!session?.user) {
          throw new APIError("UNAUTHORIZED", { message: "Authentication required" });
        }
        const accepted = await getAcceptedPolicyVersions(session.user.id);
        if (
          (accepted.tos ?? "") < requiredPolicy.tos ||
          (accepted.privacy ?? "") < requiredPolicy.privacy
        ) {
          throw new APIError("FORBIDDEN", { message: NEW_POLICY_REQUIRED_CODE });
        }
      }

      // Fresh-session gate for sensitive routes. Applies regardless of caller
      // (our tRPC router, the userscript, or a direct curl with a stolen cookie).
      if (FRESH_REQUIRED_PATHS.has(ctx.path)) {
        const session = await getSessionFromCtx(ctx);
        if (!session?.session) {
          throw new APIError("UNAUTHORIZED", { message: "Authentication required" });
        }
        if (!isSessionFresh(session.session.createdAt)) {
          throw new APIError("FORBIDDEN", { message: "FRESH_SESSION_REQUIRED" });
        }
      }

      // OAuth client URL scheme guards. BA's built-in SafeUrlSchema only runs
      // on redirect_uris and permits arbitrary custom schemes (e.g. myapp://).
      // The metadata URLs (client_uri, logo_uri, tos_uri, policy_uri) are
      // declared as plain z.string() and accept javascript:/data: — which
      // would then render raw on the consent screen. Our tRPC router applies
      // stricter refinements, but those are bypassable by calling these BA
      // endpoints directly with a session cookie. Re-enforce here.
      if (
        (ctx.path === "/oauth2/create-client" || ctx.path === "/oauth2/update-client") &&
        ctx.body &&
        typeof ctx.body === "object"
      ) {
        const body = ctx.body as Record<string, unknown>;
        const target = ctx.path === "/oauth2/update-client"
          ? ((body.update as Record<string, unknown>) ?? {})
          : body;

        const redirects = target.redirect_uris;
        if (Array.isArray(redirects)) {
          for (const r of redirects) {
            if (!isSafeRedirectUrl(r)) {
              throw new APIError("BAD_REQUEST", {
                message: "redirect_uris must be https:// (http://localhost permitted for development)",
              });
            }
          }
        }
        const assertOptionalUrl = (
          value: unknown,
          pred: (v: unknown) => boolean,
          message: string,
        ) => {
          if (value === undefined || value === null || value === "") return;
          if (!pred(value)) throw new APIError("BAD_REQUEST", { message });
        };
        for (const field of ["client_uri", "tos_uri", "policy_uri"] as const) {
          assertOptionalUrl(target[field], isSafeWebUrl, `${field} must be an http(s):// URL`);
        }
        // logo_uri is rendered as an <img> on the https consent page; tighten
        // to https-only to avoid mixed-content and phishing-pixel surface.
        assertOptionalUrl(target.logo_uri, isHttpsUrl, "logo_uri must be an https:// URL");

        if (typeof target.scope === "string") {
          await rejectInternalScopesForNonAdmin(target.scope.split(" ").filter(Boolean));
        }
      }

      // Consent endpoint hardening. Better Auth's OAuth provider accepts
      // { accept, scope? }; its client plugin adds oauth_query when the custom
      // consent page is reached from a signed authorize redirect.
      if (ctx.path === "/oauth2/consent") {
        let rawQuery: string | undefined;
        let bodyScope: string | undefined;
        if (ctx.body && typeof ctx.body === "object") {
          const b = ctx.body as { oauth_query?: unknown; scope?: unknown };
          if (typeof b.oauth_query === "string") rawQuery = b.oauth_query;
          if (typeof b.scope === "string") bodyScope = b.scope;
        }
        if (!rawQuery) {
          const contentType = ctx.request?.headers?.get?.("content-type") ?? "";
          if (contentType.includes("application/x-www-form-urlencoded") && ctx.request) {
            try {
              const text = await ctx.request.clone().text();
              const params = new URLSearchParams(text);
              rawQuery = params.get("oauth_query") ?? undefined;
              bodyScope = bodyScope ?? params.get("scope") ?? undefined;
            } catch {
              // Better Auth will return its own invalid_request if state is missing.
            }
          }
        }

        const grantedScopes = bodyScope?.split(" ").filter(Boolean) ?? [];
        const unknownGranted = grantedScopes.filter((s) => !(s in API_SCOPES));
        if (unknownGranted.length > 0) {
          throw new APIError("BAD_REQUEST", { message: `Unknown scopes: ${unknownGranted.join(", ")}` });
        }

        if (rawQuery) {
          const requestedScopes = new URLSearchParams(rawQuery).get("scope")?.split(" ").filter(Boolean) ?? [];
          const unknownRequested = requestedScopes.filter((s) => !(s in API_SCOPES));
          if (unknownRequested.length > 0) {
            throw new APIError("BAD_REQUEST", { message: `Unknown scopes: ${unknownRequested.join(", ")}` });
          }
          if (bodyScope) {
            const requested = new Set(requestedScopes);
            const extra = grantedScopes.filter((s) => !requested.has(s));
            if (extra.length > 0) {
              throw new APIError("BAD_REQUEST", {
                message: `scope must be a subset of the originally-requested scopes (extra: ${extra.join(", ")})`,
              });
            }
          }
        }

        if (grantedScopes.length > 0) {
          await rejectInternalScopesForNonAdmin(grantedScopes);
        }
      }

      if (!CAPTCHA_GATED_PATHS.has(ctx.path)) return;

      // Per-IP rate limit on the abuse outcome itself, in addition to the captcha.
      const ip = ctx.headers ? clientIpFromHeaders(ctx.headers) : "unknown";
      const rl = await passkeyRegisterLimiter.check(ip);
      if (rl.limited) {
        throw new APIError("TOO_MANY_REQUESTS", {
          message: `Too many passkey registration attempts. Try again in ${rl.retryAfter}s.`,
        });
      }

      const captcha = ctx.headers?.get("x-captcha-response");
      if (!captcha) {
        throw new APIError("BAD_REQUEST", { message: "Captcha required" });
      }
      const ok = await consumeAltchaPayload(captcha);
      if (!ok) {
        throw new APIError("BAD_REQUEST", { message: "Invalid or already-used captcha" });
      }
    }),
  },
  databaseHooks: {
    session: {
      create: {
        after: async (session) => {
          // Best-effort, non-blocking. Errors must not break sign-in.
          void refreshAvatarIfMissing(session.userId).catch((err) => {
            logger.warn({ err, userId: session.userId }, "auth.signin.avatar-refresh-threw");
          });
        },
      },
    },
    user: {
      create: {
        before: async (user, context) => {
          // Mirror Discord/Twitter avatar to R2 so we don't depend on their CDNs.
          // Failures (dead URL, transient) end up as null; the UI falls back to initials.
          if (user.image) {
            user.image = await mirrorAvatarForSignup(user.image, user.id);
          }

          const inviteRequired = await checkInviteRequirement();

          if (SIGNUP_TYPE === 'disabled') {
            throw new Error("unable_to_create_user");
          }

          // Check if invitation is required based on dynamic logic
          if (inviteRequired) {
            let inviteCode: string | null = null;

            // Try to extract invitation code from cookies
            if (context?.request) {
              const cookieHeader = context.request.headers.get('cookie');
              if (cookieHeader) {
                const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
                  const [key, value] = cookie.trim().split('=');
                  acc[key] = value;
                  return acc;
                }, {} as Record<string, string>);

                inviteCode = cookies.pendingInviteCode || null;
              }
            }

            if (!inviteCode) {
              logger.info("No invitation code found in cookies during signup");
              throw new Error("Invitation required for signup");
            }

            logger.info("Found invitation code during signup");

            // Validate invitation (we'll claim it in the after hook)
            const now = new Date();
            const [invite] = await db
              .select({
                id: schema.invites.id,
                createdBy: schema.invites.createdBy,
                claimedBy: schema.invites.claimedBy,
                expiresAt: schema.invites.expiresAt,
                revoked: schema.invites.revoked,
              })
              .from(schema.invites)
              .where(eq(schema.invites.code, inviteCode))
              .limit(1);

            if (!invite) {
              throw new Error("Invalid invitation code");
            }

            if (invite.revoked) {
              throw new Error("This invitation has been revoked");
            }

            if (invite.claimedBy) {
              throw new Error("This invitation has already been used");
            }

            if (new Date(invite.expiresAt) <= now) {
              throw new Error("This invitation has expired");
            }
          }

          return { data: user };
        },
        after: async (user, context) => {
          // Check if invitation was used (and claim it if so)
          const inviteRequired = await checkInviteRequirement();

          if (inviteRequired) {
            let inviteCode: string | null = null;

            // Read the invitation code from cookies again
            if (context?.request) {
              const cookieHeader = context.request.headers.get('cookie');
              if (cookieHeader) {
                const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
                  const [key, value] = cookie.trim().split('=');
                  acc[key] = value;
                  return acc;
                }, {} as Record<string, string>);

                inviteCode = cookies.pendingInviteCode || null;
              }
            }

            if (inviteCode) {
              logger.info({ userId: user.id }, "Attempting to claim invitation");
              try {
                await validateAndClaimInvite(inviteCode, user.id);
                logger.info({ userId: user.id }, "Successfully claimed invitation");
              } catch (error) {
                logger.error({ err: error, context: "invite-claim", userId: user.id }, "Failed to claim invitation");
                // Note: At this point the user is already created, so we can't easily roll back
                // In a production system, you might want to implement compensation logic
              }
            } else {
              logger.info({ userId: user.id }, "No invitation code found in after hook");
            }
          }

          // Seed policy acceptance for the new user. The consent dialog is the
          // only path that sets requestSignUp: true (login-screen.tsx
          // handleConsentGiven), so a brand-new user has just agreed to the
          // current versions. Best-effort: a failure must not break signup; the
          // consent gate re-prompts any user whose acceptance was not recorded.
          try {
            const currentVersions = getCurrentLegalVersions();
            const acceptedAt = new Date();
            await db.insert(schema.policyAcceptance).values([
              { userId: user.id, docType: "tos", version: currentVersions.tos, acceptedAt },
              { userId: user.id, docType: "privacy", version: currentVersions.privacy, acceptedAt },
            ]);
          } catch (error) {
            logger.error({ error, context: "policy-seed", userId: user.id }, "Failed to seed policy acceptance");
          }
        },
      },
    },
  },
});
