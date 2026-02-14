import { type Logger } from "pino";

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
  const isEdge = process.env.NEXT_RUNTIME === "edge";
  const baseLevel = process.env.LOG_LEVEL || "trace";

  if (isEdge) {
    return pino({ level: baseLevel }) as Logger;
  }

  const logtailToken = process.env.LOGTAIL_SOURCE_TOKEN;
  const targets = [];

  if (process.env.NODE_ENV === "development") {
    targets.push({
      target: "pino-pretty",
      level: "info",
      options: {
        colorize: true,
        translateTime: "SYS:standard",
        ignore: "pid,hostname",
      },
    });
  }

  if (logtailToken) {
    targets.push({
      target: "@logtail/pino",
      level: "trace",
      options: {
        sourceToken: logtailToken,
        endpoint: process.env.INGESTING_HOST
          ? `https://${process.env.INGESTING_HOST}`
          : undefined,
      },
    });
  }

  if (targets.length > 0 && typeof pino.transport === "function") {
    return pino(
      {
        level: baseLevel,
      },
      pino.transport({ targets })
    ) as Logger;
  }

  return pino({ level: process.env.LOG_LEVEL || "info" }) as Logger;
};

const isBrowser = typeof window !== "undefined";

export const logger: Logger = isBrowser
  ? createBrowserLogger()
  : createServerLogger();
