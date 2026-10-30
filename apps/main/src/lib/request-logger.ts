import { flushLogger, LOG_CONTEXT_STORE } from "@/lib/logger";
import { nanoid } from "nanoid";
import { after, type NextRequest } from "next/server";
import { AsyncLocalStorage } from "node:async_hooks";

export type LogContext = Record<string, unknown>;

// Fields that logger.ts's mixin adds to every log line in the current async
// execution context. Survives await chains and Next's after()/waitUntil (Next
// snapshots ALS context for after callbacks). One instance per process, since
// Next can evaluate this module more than once.
const globalStore = globalThis as Record<symbol, AsyncLocalStorage<LogContext> | undefined>;
const contextStorage = (globalStore[LOG_CONTEXT_STORE] ??= new AsyncLocalStorage<LogContext>());

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

// Ship buffered logs once the response is out, without delaying it. Outside a
// request (tests, scripts) there is no after(), so flush right away.
function flushAfterResponse(): void {
  try {
    after(flushLogger);
  } catch {
    void flushLogger();
  }
}

/**
 * Wrap a route handler (see docs/LOGGING.md): everything it logs, from any
 * logger, carries `route` and `requestId`, and buffered logs are shipped after
 * the response. The handler gets the `requestId` to include in its body.
 * Unhandled errors still reach instrumentation's onRequestError.
 */
export function withRequestLogContext<Context extends object = object>(
  route: string | ((request: NextRequest) => string),
  handler: (request: NextRequest, context: Context & { requestId: string }) => Promise<Response> | Response,
): (request: NextRequest, context: Context) => Promise<Response> {
  return (request, context) => {
    const requestId = getRequestId(request);
    const name = typeof route === "string" ? route : route(request);
    return withLogContext({ route: name, requestId }, async () => {
      try {
        return await handler(request, { ...context, requestId });
      } finally {
        flushAfterResponse();
      }
    });
  };
}

/**
 * Run `fn` with `fields` added to the log context of everything it does,
 * on top of the current context. Route handlers use withRequestLogContext;
 * this is for everything else (tRPC middleware, a fetch, a background job).
 */
export function withLogContext<T>(fields: LogContext, fn: () => T): T {
  return contextStorage.run({ ...contextStorage.getStore(), ...fields }, fn);
}
