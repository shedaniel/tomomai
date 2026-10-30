// @copied-from apps/main/src/lib/request-logger.ts — temporary duplicate; do not edit manually, change apps/main and re-sync (extracted to a shared package in the catalogue PR).

import { LOG_CONTEXT_STORE, logger } from "./logger";
import { nanoid } from "nanoid";
import type { Logger } from "pino";
import { AsyncLocalStorage } from "node:async_hooks";

export type LogContext = Record<string, unknown>;

// Fields that logger.ts's mixin adds to every log line in the current async
// execution context. Survives await chains and Next's after()/waitUntil (Next
// snapshots ALS context for after callbacks). One instance per process, since
// Next can evaluate this module more than once.
const globalStore = globalThis as Record<symbol, AsyncLocalStorage<LogContext> | undefined>;
const contextStorage = (globalStore[LOG_CONTEXT_STORE] ??= new AsyncLocalStorage<LogContext>());

// Minimal shape we need from a request: web-standard `Headers.get`. Satisfied by
// the Fetch `Request` (Hono's `c.req.raw`) without coupling to Next.
type HasHeaders = { headers: { get(name: string): string | null } };

/**
 * Per-request correlation id. Prefers the id assigned by middleware (the
 * `x-request-id` header, which is also echoed on the response), so the
 * middleware, the route logger, and the client-visible header all agree.
 * Falls back to a fresh `nanoid(10)` when there's no middleware (e.g. tests,
 * or routes excluded from the middleware matcher).
 */
export function getRequestId(request: HasHeaders): string {
  return request.headers.get("x-request-id") ?? nanoid(10);
}

/**
 * Start a route handler's log context (see docs/LOGGING.md): every log line
 * for the rest of the request, from any logger, carries `route` and
 * `requestId`. Returns a child logger with the same fields for the handler's
 * own lines, and the `requestId` to include in the response body.
 */
export function requestLogger(
  request: HasHeaders,
  route: string,
  extra?: LogContext,
): { log: Logger; requestId: string } {
  const requestId = getRequestId(request);
  // `extra` first so a caller can't accidentally clobber route/requestId.
  const context = { ...extra, route, requestId };
  contextStorage.enterWith(context);
  return { log: logger.child(context), requestId };
}

/**
 * Run `fn` with `fields` added to the log context of everything it does,
 * on top of the current context. Also the way to start a context where
 * requestLogger()'s enterWith() wouldn't reach, e.g. tRPC middleware.
 */
export function withLogContext<T>(fields: LogContext, fn: () => T): T {
  return contextStorage.run({ ...contextStorage.getStore(), ...fields }, fn);
}
