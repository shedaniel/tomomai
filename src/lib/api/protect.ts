import { type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { verifyAccessToken } from "better-auth/oauth2";
import { type ScopeKey, scopesToPermissions } from "@/lib/api/scopes";

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

/**
 * Verify an OAuth 2.1 Bearer JWT issued by our own oauthProvider plugin.
 * Returns an ApiKeyInfo if valid, or null if the token is not a JWT / fails verification.
 */
async function verifyOAuthToken(
  token: string,
  requiredScopes: ScopeKey[],
): Promise<ApiKeyInfo | null> {
  // Quick structural check — JWTs have exactly two dots (three base64url segments).
  if ((token.match(/\./g) ?? []).length !== 2) return null;

  try {
    const baseUrl = process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "";

    const payload = await verifyAccessToken(token, {
      verifyOptions: {
        issuer: baseUrl,
        audience: baseUrl,
      },
      // verifyAccessToken throws if any of these scopes are missing
      scopes: requiredScopes as string[],
    });

    if (!payload.sub) return null;

    // Convert the space-separated `scope` claim into our permissions map format
    const scopeList = (typeof payload.scope === "string" ? payload.scope : "")
      .split(" ")
      .filter(Boolean);
    const permissions = Object.fromEntries(scopeList.map((s) => [s, ["access"]]));

    return {
      userId: payload.sub,
      permissions,
      name: null,
      expiresAt: payload.exp ? new Date(payload.exp * 1000) : null,
    };
  } catch {
    return null;
  }
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
      // ── OAuth JWT path ────────────────────────────────────────────────────
      // API keys always start with the "tmk_" prefix; anything else that
      // looks like a JWT is treated as an OAuth Bearer token.
      if (!rawKey.startsWith("tmk_")) {
        const oauthKey = await verifyOAuthToken(rawKey, requiredScopes);
        if (oauthKey) return await handler(req, oauthKey);
        return Response.json({ error: "Invalid or expired token" }, { status: 403 });
      }

      // ── Personal API key path ─────────────────────────────────────────────
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
