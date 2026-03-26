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

let logtailInstance: { flush: () => Promise<void> } | null = null;

const createServerLogger = (): Logger => {
  const pino = require("pino");
  const isEdge = process.env.NEXT_RUNTIME === "edge";
  const baseLevel = process.env.LOG_LEVEL || "trace";

  if (isEdge) {
    return pino({ level: baseLevel }) as Logger;
  }

  const logtailToken = process.env.DEV_LOGTAIL_SOURCE_TOKEN;
  const streams: { stream: { write: (chunk: string) => void } | NodeJS.WritableStream; level: string }[] = [];

  if (process.env.NODE_ENV === "development") {
    const pretty = require("pino-pretty");
    streams.push({
      stream: pretty({
        colorize: true,
        translateTime: "SYS:standard",
        ignore: "pid,hostname",
      }),
      level: "debug",
    });
  }

  if (logtailToken) {
    const { Logtail } = require("@logtail/node");
    const logtail = new Logtail(logtailToken, {
      endpoint: process.env.INGESTING_HOST
        ? `https://${process.env.INGESTING_HOST}`
        : undefined,
    });
    logtailInstance = logtail;
    streams.push({
      stream: {
        write(chunk: string) {
          try {
            const log = JSON.parse(chunk);
            const { msg, level, time, ...rest } = log;
            logtail.log(msg ?? "", levelToString(level), rest);
          } catch {
            logtail.log(chunk, "info");
          }
        },
      },
      level: "trace",
    });
  }

  if (streams.length > 0) {
    return pino({ level: baseLevel }, pino.multistream(streams)) as Logger;
  }

  return pino({ level: process.env.LOG_LEVEL || "info" }) as Logger;
};

function levelToString(level: number): "debug" | "info" | "warn" | "error" {
  if (level >= 50) return "error";
  if (level >= 40) return "warn";
  if (level >= 20) return "debug";
  return "info";
}

const isBrowser = typeof window !== "undefined";

export const logger: Logger = isBrowser
  ? createBrowserLogger()
  : createServerLogger();

export async function flushLogger(): Promise<void> {
  await logtailInstance?.flush();
}
