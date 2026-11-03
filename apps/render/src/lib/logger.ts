import pino, { type Logger } from "pino";

/**
 * Service logger. Unlike apps/main's logger (which juggles edge/serverless
 * runtimes and Axiom/Logtail transports behind require()), this is a long-lived
 * Node process, so a plain structured pino instance to stdout is the right
 * shape: JSON in production, pretty in development. Follow docs/LOGGING.md —
 * structured logging, and pass errors as the `err` field (pino serializes it).
 *
 * If/when we want log shipping here, add a pino transport; keep the `logger` and
 * `flushLogger` surface stable for callers.
 */
const isProd = process.env.NODE_ENV === "production";

// Where request-logger.ts publishes its AsyncLocalStorage of log context.
export const LOG_CONTEXT_STORE = Symbol.for("tomomai.logger.context");

type LogContextStore = { getStore(): Record<string, unknown> | undefined };

const boundKeys = new WeakMap<Logger, Set<string>>();

// Adds the current async context's fields (route, requestId, ...) to every
// line from every logger, skipping keys the logger already binds.
function logContextMixin(_mergeObject: object, _level: number, instance: Logger): object {
  const store = (globalThis as Record<symbol, LogContextStore | undefined>)[LOG_CONTEXT_STORE];
  const context = store?.getStore();
  if (!context) return {};

  let bound = boundKeys.get(instance);
  if (!bound) {
    bound = new Set(Object.keys(instance.bindings()));
    boundKeys.set(instance, bound);
  }
  const fields: Record<string, unknown> = {};
  for (const key in context) {
    if (!bound.has(key)) fields[key] = context[key];
  }
  return fields;
}

export const logger: Logger = pino({
  level: process.env.LOG_LEVEL || (isProd ? "info" : "debug"),
  mixin: logContextMixin,
  ...(isProd
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "SYS:HH:MM:ss.l" },
        },
      }),
});

/** No async transport buffering here, so flushing is a no-op. Kept for API parity. */
export async function flushLogger(): Promise<void> {
  /* nothing to flush for stdout pino */
}
