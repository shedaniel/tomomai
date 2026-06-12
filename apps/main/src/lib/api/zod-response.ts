import type { z } from "zod";
import { logger } from "@/lib/logger";

/**
 * Validate `data` against the route's response `schema` and return a JSON
 * Response. Validation runs in every environment (including production) —
 * the schema in each route's `spec.ts` is the contract.
 *
 * On mismatch the call logs the Zod issues and returns a 500. We never
 * return `parsed.data`: Zod's default `.strip()` would silently drop
 * unknown fields and hide drift, so the handler's output must match the
 * schema exactly for the request to succeed.
 *
 * Optional `routeId` (e.g. `"GET /api/v1/maimai/songs"`) is included in the log
 * line so logs are actionable when a handler is added without a spec
 * update or vice versa.
 */
export function zodJson<T>(
  schema: z.ZodType<T>,
  data: T,
  init?: ResponseInit,
  routeId?: string,
): Response {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    logger.error(
      { routeId, issues: parsed.error.issues },
      "[zodJson] response schema mismatch",
    );
    return Response.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
  return Response.json(data, init);
}
