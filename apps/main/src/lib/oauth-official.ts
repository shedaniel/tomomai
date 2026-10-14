import { sql, type SQL } from "drizzle-orm";
import { oauthClient } from "@/lib/db/schema-pg";

/** Better Auth stores client metadata either as a JSON object or as a JSON-encoded string. */
function parseMetadata(metadata: unknown): Record<string, unknown> | null {
  if (typeof metadata === "string") {
    try {
      const parsed: unknown = JSON.parse(metadata);
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  return metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : null;
}

/** Official apps are run by tomomai itself. Only admins can set the flag. */
export function isOfficialClient(metadata: unknown): boolean {
  return parseMetadata(metadata)?.official === true;
}

/** Merges `official` into the stored metadata, normalising a string-encoded value to an object. */
export function officialMetadata(official: boolean): SQL {
  return sql`(case when jsonb_typeof(${oauthClient.metadata}) = 'string'
    then (${oauthClient.metadata} #>> '{}')::jsonb
    else coalesce(${oauthClient.metadata}, '{}'::jsonb) end) || jsonb_build_object('official', ${official}::boolean)`;
}

export type UsageBucket = "lt10" | "lt50" | "lt100" | "gte100" | "gte200" | "gte500" | "gte1000";

/** Coarse on purpose: exact counts would let anyone track an app's growth day by day. */
export function usageBucket(users: number): UsageBucket {
  if (users < 10) return "lt10";
  if (users < 50) return "lt50";
  if (users < 100) return "lt100";
  if (users < 200) return "gte100";
  if (users < 500) return "gte200";
  if (users < 1000) return "gte500";
  return "gte1000";
}
