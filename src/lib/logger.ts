// Create a browser-compatible logger that matches pino's API
const createBrowserLogger = () => {
  const noop = () => {};
  const consoleLogger = {
    trace: console.debug.bind(console),
    debug: console.debug.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    fatal: console.error.bind(console),
    // Child logger support (returns the same logger)
    child: () => consoleLogger,
    // Other pino methods as no-ops
    level: "info",
    silent: noop,
  };
  return consoleLogger;
};

// Create server logger with dynamic import to avoid bundling pino in client code
const createServerLogger = () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Required to prevent pino from being bundled in client code
  const pino = require("pino");
  return pino({
    level: process.env.LOG_LEVEL || "info",
    transport: process.env.NODE_ENV === "development" ? {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "SYS:standard",
        ignore: "pid,hostname",
      }
    } : undefined,
  });
};

// Check if we're in a browser environment
const isBrowser = typeof window !== "undefined";

export const logger = isBrowser ? createBrowserLogger() : createServerLogger();

