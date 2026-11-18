import type { z } from "zod";

/** The error `code` of a 400 for a path or query parameter that fails its schema. */
export const INVALID_PARAMETER = "INVALID_PARAMETER";

export function parseParams<T extends z.ZodObject>(params: Record<string, string | string[]>, schema: T): z.output<T> | Response {
  return parseInput(schema, params, (path, message) => `Invalid path param ${path}: ${message}`);
}

export function parseQuery<T extends z.ZodObject>(searchParams: URLSearchParams, schema: T): z.output<T> | Response {
  return parseInput(schema, Object.fromEntries(searchParams), (path, message) =>
    searchParams.has(path) ? `Invalid ?${path}: ${message}` : `Missing required ?${path}`);
}

/** Reads a JSON request body against its schema, or answers the same 400 a bad parameter does. */
export async function parseBody<T extends z.ZodObject>(req: Request, schema: T): Promise<z.output<T> | Response> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json({ error: "The body must be JSON", code: INVALID_PARAMETER }, { status: 400 });
  }
  return parseInput(schema, json, (path, message) => `Invalid body field ${path}: ${message}`);
}

function parseInput<T extends z.ZodObject>(schema: T, input: unknown, describe: (path: string, message: string) => string): z.output<T> | Response {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const [first] = result.error.issues;
  const path = first.path.join(".");
  return Response.json(
    { error: path ? describe(path, first.message) : first.message, code: INVALID_PARAMETER },
    { status: 400 },
  );
}
