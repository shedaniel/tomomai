import { type Logger } from "pino";

// Simplified logger for the data service: plain pino with pino-pretty in dev.
// Keeps the same exported surface as apps/main's logger (logger + flushLogger)
// without the Logtail/Axiom shipping streams.

const createBrowserLogger = (): Logger => {
  const noop = () => { };
  const mock = {
    level: "info",
    silent: noop,
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug.bind(console),
    trace: console.debug.bind(console),
    fatal: console.error.bind(console),
    child: () => mock,
    bindings: () => ({}),
    flush: noop,
    version: "browser",
    setBindings: noop,
    on: noop,
    emit: noop,
  };
  return mock as unknown as Logger;
};

const createServerLogger = (): Logger => {
   
  const pino = require("pino");
  const baseLevel = process.env.LOG_LEVEL || "info";

  if (process.env.NODE_ENV === "development" && process.env.NEXT_RUNTIME !== "edge") {
    try {
       
      const pretty = require("pino-pretty");
      return pino(
        { level: process.env.LOG_LEVEL || "debug" },
        pretty({
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        }),
      ) as Logger;
    } catch {
      // pino-pretty unavailable — fall through to plain pino
    }
  }

  return pino({ level: baseLevel }) as Logger;
};

const isBrowser = typeof window !== "undefined";

export const logger: Logger = isBrowser
  ? createBrowserLogger()
  : createServerLogger();

export async function flushLogger(): Promise<void> {
  // No off-box shipping streams in the data service; nothing to flush.
}
