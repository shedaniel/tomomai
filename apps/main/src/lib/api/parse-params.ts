import type { z } from "zod";

/**
 * Validate Next 16 dynamic-route params against a spec's `params` schema and
 * return either the parsed object or a 400 Response. Mirrors `parseQuery`.
 *
 * Pass the raw `ctx.params` (a Promise in Next 16); this helper awaits it.
 */
export async function parseParams<T extends z.ZodTypeAny>(
  params: Promise<Record<string, string | string[]>> | Record<string, string | string[]> | undefined,
  schema: T,
): Promise<z.infer<T> | Response> {
  const resolved = (await params) ?? {};
  const result = schema.safeParse(resolved);
  if (!result.success) {
    const first = result.error.issues[0];
    const path = first.path.join(".");
    return Response.json(
      { error: path ? `Invalid path param ${path}: ${first.message}` : first.message },
      { status: 400 },
    );
  }
  return result.data;
}
