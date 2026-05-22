import { type NextRequest } from "next/server";
import { createHash } from "crypto";
import { auth } from "@/lib/auth";
import { verifyAccessToken } from "better-auth/oauth2";
import { type ScopeKey, scopesToPermissions } from "@/lib/api/scopes";
import { resolveBaseUrl } from "@/lib/base-url";
import { db } from "@/lib/db";
import { oauthAccessToken } from "@/lib/db/schema-pg";
import { eq } from "drizzle-orm";
import { findRouteByRequest } from "@/lib/api/registry";
import { apiKeyLimiter, apiUserLimiter } from "@/lib/security/redis-rate-limit";
import { consumeMonthly, peekMonthly, refundMonthly } from "@/lib/api/quota";
import { logger } from "@/lib/logger";

export interface ApiKeyInfo {
  userId: string;
  /** Stable per-token identifier for the per-key rate limit bucket. */
  keyId: string;
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

/** Stable surrogate identifier for JWT bearer tokens that lack a `jti`. */
function jwtSurrogateId(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex").slice(0, 16);
}

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
          keyId: jwtSurrogateId(token),
          permissions: Object.fromEntries(scopeList.map((s) => [s, ["access"]])),
          name: null,
          expiresAt: payload.exp ? new Date(payload.exp * 1000) : null,
        };
      }
    } catch {
      // Fall through to opaque lookup.
    }
  }

  // ── Opaque-token DB lookup ─────────────────────────────────────────────
  const [row] = await db
    .select({
      id: oauthAccessToken.id,
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
    keyId: row.id,
    permissions: Object.fromEntries(row.scopes.map((s) => [s, ["access"]])),
    name: null,
    expiresAt: row.expiresAt,
  };
}

function quotaResetSeconds(resetAt: Date): string {
  return String(Math.floor(resetAt.getTime() / 1000));
}

interface RateState {
  cost: number;
  perKey: { limit: number; remaining: number; retryAfter: number };
  perUser: { limit: number; remaining: number; retryAfter: number };
  quota: { limit: number; used: number; resetAt: Date };
}

function applyV1Headers(res: Response, state: RateState): Response {
  res.headers.set("X-RateLimit-Limit", String(state.perKey.limit));
  res.headers.set("X-RateLimit-Remaining", String(state.perKey.remaining));
  res.headers.set("X-RateLimit-Reset", String(state.perKey.retryAfter));
  res.headers.set("X-RateLimit-User-Limit", String(state.perUser.limit));
  res.headers.set("X-RateLimit-User-Remaining", String(state.perUser.remaining));
  res.headers.set("X-RateLimit-Cost", String(state.cost));
  res.headers.set("X-Quota-Limit", String(state.quota.limit));
  res.headers.set(
    "X-Quota-Remaining",
    String(Math.max(0, state.quota.limit - state.quota.used)),
  );
  res.headers.set("X-Quota-Reset", quotaResetSeconds(state.quota.resetAt));
  return res;
}

export function withApiKey(
  requiredScopes: ScopeKey[],
  handler: (req: NextRequest, key: ApiKeyInfo) => Promise<Response>
) {
  return async (req: NextRequest, _context?: unknown) => {
    const authHeader = req.headers.get("authorization");
    const rawKey =
      req.headers.get("x-api-key") ??
      (authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined);

    if (!rawKey) {
      return Response.json({ error: "Missing API key" }, { status: 401 });
    }

    try {
      let key: ApiKeyInfo | null = null;
      if (!rawKey.startsWith("tmk_")) {
        key = await verifyOAuthToken(rawKey, requiredScopes);
        if (!key) {
          return Response.json({ error: "Invalid or expired token" }, { status: 403 });
        }
      } else {
        const result = await auth.api.verifyApiKey({
          body: { key: rawKey, permissions: scopesToPermissions(requiredScopes) },
        });
        if (!result.valid || !result.key) {
          return Response.json(
            { error: result.error?.message ?? "Forbidden" },
            { status: 403 }
          );
        }
        key = {
          userId: result.key.referenceId,
          keyId: result.key.id,
          permissions: result.key.permissions ?? {},
          name: result.key.name,
          expiresAt: result.key.expiresAt,
        };
      }

      // Resolve cost from the registry. Fail closed if no spec is
      // registered — every protected route must declare its cost, otherwise
      // an unregistered handler would silently bypass quota accounting.
      const pathname = new URL(req.url).pathname;
      const spec = findRouteByRequest(req.method, pathname);
      if (!spec) {
        logger.error(
          { method: req.method, pathname },
          "withApiKey: no RouteSpec registered for protected route",
        );
        return Response.json(
          { error: "Internal server error" },
          { status: 500 },
        );
      }
      const cost = spec.cost ?? 1;

      // Layered rate-limit check. Consume in order; refund earlier consumes
      // if a later limiter rejects. The race window is small and never grants
      // extra budget — it only briefly over-counts during contention.
      const perKey = await apiKeyLimiter.check(key.keyId, cost);
      if (perKey.limited) {
        const quota = await peekMonthly(key.userId);
        return finalize429(perKey.retryAfter, "Per-key rate limit exceeded", {
          cost,
          perKey: { limit: perKey.limit, remaining: perKey.remaining, retryAfter: perKey.retryAfter },
          perUser: { limit: 0, remaining: 0, retryAfter: 0 },
          quota,
        }, /*headersFromLimiter*/ true);
      }

      const perUser = await apiUserLimiter.check(key.userId, cost);
      if (perUser.limited) {
        await apiKeyLimiter.reward(key.keyId, cost);
        const quota = await peekMonthly(key.userId);
        return finalize429(perUser.retryAfter, "Per-user rate limit exceeded", {
          cost,
          perKey: { limit: perKey.limit, remaining: perKey.remaining + cost, retryAfter: perKey.retryAfter },
          perUser: { limit: perUser.limit, remaining: perUser.remaining, retryAfter: perUser.retryAfter },
          quota,
        }, true);
      }

      const quota = await consumeMonthly(key.userId, cost);
      if (!quota.ok) {
        await apiKeyLimiter.reward(key.keyId, cost);
        await apiUserLimiter.reward(key.userId, cost);
        const retryAfter = Math.max(
          1,
          Math.floor((quota.resetAt.getTime() - Date.now()) / 1000),
        );
        return finalize429(retryAfter, "Monthly quota exceeded", {
          cost,
          perKey: { limit: perKey.limit, remaining: perKey.remaining + cost, retryAfter: perKey.retryAfter },
          perUser: { limit: perUser.limit, remaining: perUser.remaining + cost, retryAfter: perUser.retryAfter },
          quota,
        }, true);
      }

      const state: RateState = {
        cost,
        perKey: { limit: perKey.limit, remaining: perKey.remaining, retryAfter: perKey.retryAfter },
        perUser: { limit: perUser.limit, remaining: perUser.remaining, retryAfter: perUser.retryAfter },
        quota,
      };

      let response: Response;
      try {
        response = await handler(req, key);
      } catch (err) {
        // If the handler itself throws, refund — the request didn't succeed.
        await Promise.all([
          apiKeyLimiter.reward(key.keyId, cost),
          apiUserLimiter.reward(key.userId, cost),
          refundMonthly(key.userId, cost),
        ]);
        throw err;
      }
      return applyV1Headers(response, state);
    } catch (err) {
      console.error("API handler error:", err);
      return Response.json({ error: "Internal server error" }, { status: 500 });
    }
  };
}

function finalize429(
  retryAfter: number,
  message: string,
  state: RateState,
  setRetryAfter: boolean,
): Response {
  const res = Response.json({ error: message }, { status: 429 });
  applyV1Headers(res, state);
  if (setRetryAfter) {
    res.headers.set("Retry-After", String(Math.max(1, retryAfter)));
  }
  return res;
}
