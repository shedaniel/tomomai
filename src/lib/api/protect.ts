import { type NextRequest } from "next/server";
import { createHash } from "crypto";
import { auth } from "@/lib/auth";
import { verifyAccessToken } from "better-auth/oauth2";
import { type ScopeKey, scopesToPermissions } from "@/lib/api/scopes";
import { resolveBaseUrl } from "@/lib/base-url";
import { db } from "@/lib/db";
import { oauthAccessToken } from "@/lib/db/schema-pg";
import { eq } from "drizzle-orm";

export interface ApiKeyInfo {
  userId: string;
  permissions: Record<string, string[]>;
  name: string | null;
  expiresAt: Date | null;
}

/** Returns true if the key holds the given scope. */
export function keyHasScope(key: ApiKeyInfo, scope: ScopeKey): boolean {
  return Array.isArray(key.permissions[scope]) && key.permissions[scope].includes("access");
}

/** Match Better Auth's defaultHasher: SHA-256 → base64url (no padding). */
function hashTokenForStorage(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("base64url");
}

/**
 * Verify an OAuth Bearer access token issued by our own oauthProvider.
 *
 * Two paths, tried in order so any standard OAuth 2.1 client works out of the
 * box:
 *
 * 1. **JWT** (fast, no DB hit). A client opts into this by sending
 *    `resource=<baseUrl>` at the token endpoint per RFC 8707. The token is a
 *    signed JWT verifiable via /api/auth/jwks. No issuer-side coordination
 *    needed beyond `validAudiences` in the oauthProvider config.
 *
 * 2. **Opaque** (one indexed DB lookup). This is what Better Auth issues by
 *    default — a 32-char random string keyed into `oauthAccessToken`. We
 *    can't use /oauth2/introspect because it requires client credentials and
 *    only validates tokens issued *to* the introspecting client, breaking
 *    multi-app setups. Instead we read the table directly, applying the same
 *    SHA-256-base64url hash Better Auth uses at write time (storeToken in
 *    @better-auth/oauth-provider). This works for tokens issued to any
 *    OAuth client without per-app configuration.
 *
 * Both paths enforce scope and expiry.
 */
async function verifyOAuthToken(
  token: string,
  requiredScopes: ScopeKey[],
): Promise<ApiKeyInfo | null> {
  // ── JWT fast-path ──────────────────────────────────────────────────────
  if ((token.match(/\./g) ?? []).length === 2) {
    const baseUrl =
      process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? resolveBaseUrl();
    const issuer = `${baseUrl}/api/auth`;
    try {
      const payload = await verifyAccessToken(token, {
        jwksUrl: `${issuer}/jwks`,
        verifyOptions: { issuer, audience: baseUrl },
        scopes: requiredScopes as string[],
      });
      if (payload.sub) {
        const scopeList = (typeof payload.scope === "string" ? payload.scope : "")
          .split(" ")
          .filter(Boolean);
        return {
          userId: payload.sub,
          permissions: Object.fromEntries(scopeList.map((s) => [s, ["access"]])),
          name: null,
          expiresAt: payload.exp ? new Date(payload.exp * 1000) : null,
        };
      }
    } catch {
      // Fall through to opaque lookup — token might look like a JWT but actually
      // be a coincidence (3 dot-separated chunks of arbitrary chars).
    }
  }

  // ── Opaque-token DB lookup ─────────────────────────────────────────────
  const [row] = await db
    .select({
      userId: oauthAccessToken.userId,
      scopes: oauthAccessToken.scopes,
      expiresAt: oauthAccessToken.expiresAt,
    })
    .from(oauthAccessToken)
    .where(eq(oauthAccessToken.token, hashTokenForStorage(token)))
    .limit(1);

  if (!row || !row.userId) return null;
  if (row.expiresAt.getTime() <= Date.now()) return null;
  for (const required of requiredScopes) {
    if (!row.scopes.includes(required)) return null;
  }

  return {
    userId: row.userId,
    permissions: Object.fromEntries(row.scopes.map((s) => [s, ["access"]])),
    name: null,
    expiresAt: row.expiresAt,
  };
}

export function withApiKey(
  requiredScopes: ScopeKey[],
  handler: (req: NextRequest, key: ApiKeyInfo) => Promise<Response>
) {
  return async (req: NextRequest, context?: unknown) => {
    const authHeader = req.headers.get("authorization");
    const rawKey =
      req.headers.get("x-api-key") ??
      (authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined);

    if (!rawKey) {
      return Response.json({ error: "Missing API key" }, { status: 401 });
    }

    try {
      // API keys carry the "tmk_" prefix; anything else is treated as an
      // OAuth Bearer token (JWT or opaque).
      if (!rawKey.startsWith("tmk_")) {
        const oauthKey = await verifyOAuthToken(rawKey, requiredScopes);
        if (oauthKey) return await handler(req, oauthKey);
        return Response.json({ error: "Invalid or expired token" }, { status: 403 });
      }

      const result = await auth.api.verifyApiKey({
        body: { key: rawKey, permissions: scopesToPermissions(requiredScopes) },
      });

      if (!result.valid || !result.key) {
        return Response.json(
          { error: result.error?.message ?? "Forbidden" },
          { status: 403 }
        );
      }

      const key: ApiKeyInfo = {
        userId: result.key.referenceId,
        permissions: result.key.permissions ?? {},
        name: result.key.name,
        expiresAt: result.key.expiresAt,
      };
      return await handler(req, key);
    } catch (err) {
      console.error("API handler error:", err);
      return Response.json({ error: "Internal server error" }, { status: 500 });
    }
  };
}
