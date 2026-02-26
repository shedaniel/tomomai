import { withApiKey } from "@/lib/api/protect";
import { type ScopeKey } from "@/lib/api/scopes";

export const GET = withApiKey(["ready"], async (_req, key) => {
  const scopes = Object.entries(key.permissions)
    .filter(([, perms]) => Array.isArray(perms) && perms.includes("access"))
    .map(([scope]) => scope as ScopeKey);

  return Response.json({ scopes });
});
