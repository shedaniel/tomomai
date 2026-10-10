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
    const error = !path ? first.message : searchParams.has(path) ? `Invalid ?${path}: ${first.message}` : `Missing required ?${path}`;
    return Response.json({ error }, { status: 400 });
  }
  return result.data;
}
