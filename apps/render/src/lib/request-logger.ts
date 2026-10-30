// @copied-from apps/main/src/lib/request-logger.ts — temporary duplicate; do not edit manually, change apps/main and re-sync (extracted to a shared package in the catalogue PR).
// Omits withRequestLogContext, which wraps Next route handlers; server.ts opens the context in Hono middleware instead.

import { LOG_CONTEXT_STORE } from "./logger";
import { nanoid } from "nanoid";
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
 * Run `fn` with `fields` added to the log context of everything it does,
 * on top of the current context. Route handlers use withRequestLogContext;
 * this is for everything else (tRPC middleware, a fetch, a background job).
 */
export function withLogContext<T>(fields: LogContext, fn: () => T): T {
  return contextStorage.run({ ...contextStorage.getStore(), ...fields }, fn);
}
