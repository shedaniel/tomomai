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
  return async (req: NextRequest) => {
    const rawKey =
      req.headers.get("x-api-key") ??
      req.headers.get("authorization")?.replace("Bearer ", "");

    if (!rawKey) {
      return Response.json({ error: "Missing API key" }, { status: 401 });
    }

    const result = await auth.api.verifyApiKey({
      body: { key: rawKey, permissions: scopesToPermissions(requiredScopes) },
    });

    if (!result.valid) {
      return Response.json(
        { error: result.error?.message ?? "Forbidden" },
        { status: 403 }
      );
    }

    const key = result.key! as ApiKeyInfo;
    return handler(req, key);
  };
}
