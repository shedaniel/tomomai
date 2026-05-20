import type { z } from "zod";

export function parseQuery<T extends z.ZodTypeAny>(
  searchParams: URLSearchParams,
  schema: T,
): z.infer<T> | Response {
  const obj: Record<string, string> = {};
  for (const [k, v] of searchParams.entries()) obj[k] = v;
  const result = schema.safeParse(obj);
  if (!result.success) {
    const first = result.error.issues[0];
    const path = first.path.join(".");
    return Response.json(
      { error: path ? `Invalid ?${path}: ${first.message}` : first.message },
      { status: 400 },
    );
  }
  return result.data;
}
