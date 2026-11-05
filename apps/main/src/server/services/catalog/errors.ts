import "server-only";
import { DrizzleQueryError } from "drizzle-orm";

export function formatCatalogError(error: Error): string {
  if (!(error instanceof DrizzleQueryError)) return error.message;
  while (error instanceof DrizzleQueryError) {
    if (!error.cause) return "Database query failed";
    error = error.cause;
  }

  const code = "code" in error && typeof error.code === "string" ? error.code : undefined;
  const constraint = "constraint_name" in error ? error.constraint_name : "constraint" in error ? error.constraint : undefined;
  return [
    code ? `[${code}]` : undefined,
    error.message,
    typeof constraint === "string" ? `(constraint: ${constraint})` : undefined,
  ].filter(Boolean).join(" ");
}
