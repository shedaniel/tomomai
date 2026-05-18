import { type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
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
