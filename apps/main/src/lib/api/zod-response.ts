import type { z } from "zod";
import { getLogger } from "@/lib/request-logger";

/**
 * Validate `data` against the route's response `schema` and return a JSON
 * Response. Validation runs in every environment (including production), because
 * the schema in each route's `spec.ts` is the contract.
 *
 * On mismatch the call logs the Zod issues and returns a 500. We never
 * return `parsed.data`: Zod's default `.strip()` would silently drop
 * unknown fields and hide drift, so the handler's output must match the
 * schema exactly for the request to succeed.
 */
export function zodJson<T>(schema: z.ZodType<T>, data: T, init?: ResponseInit): Response {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`);
    getLogger().error({ issues }, "Response does not match its schema");
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
  return Response.json(data, init);
}
