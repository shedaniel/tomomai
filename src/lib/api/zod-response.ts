import type { z } from "zod";

/**
 * Validate `data` against `schema` in development, then return a JSON
 * Response. In production validation is skipped for speed — the registry's
 * Zod schema is treated as documentation, not a runtime guard.
 *
 * Routes should call this instead of `Response.json(...)` so that drift
 * between the documented schema and the real handler output is caught
 * locally during development.
 */
export function zodJson<T>(schema: z.ZodType<T>, data: T, init?: ResponseInit): Response {
  if (process.env.NODE_ENV !== "production") {
    const parsed = schema.safeParse(data);
    if (!parsed.success) {
      console.error(
        "[zodJson] response schema mismatch:",
        JSON.stringify(parsed.error.issues, null, 2),
      );
    }
  }
  return Response.json(data, init);
}
