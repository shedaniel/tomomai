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

export const logger: Logger = pino({
  level: process.env.LOG_LEVEL || (isProd ? "info" : "debug"),
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
