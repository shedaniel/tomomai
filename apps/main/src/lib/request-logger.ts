import { logger } from "@/lib/logger";
import { nanoid } from "nanoid";
import type { NextRequest } from "next/server";
import type { Logger } from "pino";
import { AsyncLocalStorage } from "node:async_hooks";

// Ambient per-request logger. requestLogger() binds the child logger to the
// current async execution context, so lib/service code deep in the call chain
// can pick it up via getLogger() without threading `log` through every
// signature. Survives await chains and Next's after()/waitUntil (Next snapshots
// ALS context for after callbacks).
const loggerStorage = new AsyncLocalStorage<Logger>();

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
  const log = logger.child({ route, requestId, ...extra });
  // Bind as the ambient logger for the rest of this request's async chain.
  loggerStorage.enterWith(log);
  return { log, requestId };
}

/**
 * Ambient logger for lib/service code that isn't handed a `log` explicitly.
 * Returns the request-scoped child logger (with `route`/`requestId`) when
 * called downstream of a route that used requestLogger(); falls back to the
 * root logger outside a request scope (build time, scripts, background jobs
 * not started from a request).
 */
export function getLogger(): Logger {
  return loggerStorage.getStore() ?? logger;
}

/**
 * Run `fn` with `log` as the ambient logger. Use this where enterWith()'s
 * binding wouldn't survive — e.g. tRPC middleware, where the context factory is
 * awaited by the framework and its execution context doesn't propagate to
 * procedure calls.
 */
export function runWithLogger<T>(log: Logger, fn: () => T): T {
  return loggerStorage.run(log, fn);
}
