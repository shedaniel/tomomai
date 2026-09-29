import type { z } from "zod";

/** The error `code` of a 400 for a path or query parameter that fails its schema. */
export const INVALID_PARAMETER = "INVALID_PARAMETER";

export function parseParams<T extends z.ZodObject>(params: Record<string, string | string[]>, schema: T): z.output<T> | Response {
  return parseInput(schema, params, (path) => `Invalid path param ${path}`);
}

export function parseQuery<T extends z.ZodObject>(searchParams: URLSearchParams, schema: T): z.output<T> | Response {
  return parseInput(schema, Object.fromEntries(searchParams), (path) => `Invalid ?${path}`);
}

function parseInput<T extends z.ZodObject>(schema: T, input: unknown, label: (path: string) => string): z.output<T> | Response {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const [first] = result.error.issues;
  const path = first.path.join(".");
  return Response.json(
    { error: path ? `${label(path)}: ${first.message}` : first.message, code: INVALID_PARAMETER },
    { status: 400 },
  );
}
