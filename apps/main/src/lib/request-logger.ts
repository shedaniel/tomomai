import { logger } from "@/lib/logger";
import { nanoid } from "nanoid";
import type { NextRequest } from "next/server";
import type { Logger } from "pino";

/**
 * Per-request correlation id. Prefers the id assigned by middleware (the
 * `x-request-id` header, which is also echoed on the response), so the
 * middleware, the route logger, and the client-visible header all agree.
 * Falls back to a fresh `nanoid(10)` when there's no middleware (e.g. tests,
 * or routes excluded from the middleware matcher).
 */
export function getRequestId(request: NextRequest): string {
  return request.headers.get("x-request-id") ?? nanoid(10);
}

/**
 * Build the per-request child logger for a route handler (see
 * docs/LOGGING.md). Returns the `requestId` alongside so it can be included in
 * the response body. Pass `log` (not the root `logger`) into any helpers so
 * their lines inherit the same `route`/`requestId` context.
 */
export function requestLogger(
  request: NextRequest,
  route: string,
  extra?: Record<string, unknown>,
): { log: Logger; requestId: string } {
  const requestId = getRequestId(request);
  return { log: logger.child({ route, requestId, ...extra }), requestId };
}
