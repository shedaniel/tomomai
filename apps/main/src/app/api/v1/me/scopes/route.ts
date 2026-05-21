import { withApiKey } from "@/lib/api/protect";
import { zodJson } from "@/lib/api/zod-response";
import { type ScopeKey } from "@/lib/api/scopes";
import { spec } from "./spec";

export const GET = withApiKey(["ready"], async (_req, key) => {
  const scopes = Object.entries(key.permissions)
    .filter(([, perms]) => Array.isArray(perms) && perms.includes("access"))
    .map(([scope]) => scope as ScopeKey);
  return zodJson(spec.response, { scopes });
});
