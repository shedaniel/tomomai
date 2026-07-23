import { type Logger } from "pino";
// NOTE: Do NOT statically import "stream" or any other Node builtin here.
// This file is transitively imported by src/middleware.ts (Edge runtime),
// and a top-level Node-only import would fail Turbopack's edge compile.
// Use require() inside non-edge code paths instead.

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
let axiomFlush: (() => Promise<void>) | null = null;

type AxiomStream = {
  stream: NodeJS.WritableStream;
  flush: () => Promise<void>;
};

const createAxiomStream = (token: string, dataset: string): AxiomStream => {
  const endpoint = `https://${process.env.AXIOM_URL || "api.axiom.co"}/v1/datasets/${encodeURIComponent(dataset)}/ingest`;
  let buffer: Record<string, unknown>[] = [];
  let pending: Promise<void> = Promise.resolve();
  let timer: NodeJS.Timeout | null = null;
  let consecutiveFailures = 0;
  let disabled = false;
  const FLUSH_INTERVAL_MS = 1000;
  const MAX_BATCH = 100;
  const MAX_FAILURES = 5;

  const send = async (events: Record<string, unknown>[]) => {
    if (events.length === 0 || disabled) return;
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(events),
      });
      if (!res.ok) {
        throw new Error(`Axiom ingest failed: ${res.status} ${res.statusText}`);
      }
      consecutiveFailures = 0;
    } catch (err) {
      consecutiveFailures++;
      // eslint-disable-next-line no-console
      console.warn(
        `[logger] Axiom ingest error (${consecutiveFailures}/${MAX_FAILURES}):`,
        err instanceof Error ? err.message : err,
      );
      if (consecutiveFailures >= MAX_FAILURES) {
        disabled = true;
        buffer = [];
        // eslint-disable-next-line no-console
        console.error(
          `[logger] Axiom ingest disabled after ${MAX_FAILURES} consecutive failures`,
        );
      }
    }
  };

  const flush = async () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    const events = buffer;
    buffer = [];
    pending = pending.then(() => send(events));
    await pending;
  };

  const scheduleFlush = () => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      void flush();
    }, FLUSH_INTERVAL_MS);
  };

  const { Writable } = require("stream") as typeof import("stream");
  const stream = new Writable({
    write(chunk: Buffer | string, _encoding: BufferEncoding, callback: (err?: Error | null) => void) {
      if (disabled) {
        callback();
        return;
      }
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      try {
        const log = JSON.parse(text);
        const { time, level, ...rest } = log;
        buffer.push({
          _time: typeof time === "number" ? new Date(time).toISOString() : new Date().toISOString(),
          level: levelToString(level),
          ...rest,
        });
      } catch {
        buffer.push({
          _time: new Date().toISOString(),
          level: "info",
          msg: text,
        });
      }
      if (buffer.length >= MAX_BATCH) {
        void flush();
      } else {
        scheduleFlush();
      }
      callback();
    },
  });

  return { stream, flush };
};

type StreamEntry = { stream: { write: (chunk: string) => void } | NodeJS.WritableStream; level: string };

const createServerLogger = (): Logger => {
  const pino = require("pino");
  const isEdge = process.env.NEXT_RUNTIME === "edge";
  const baseLevel = process.env.LOG_LEVEL || (process.env.NODE_ENV === "development" ? "trace" : "info");

  if (isEdge) {
    return pino({ level: baseLevel }) as Logger;
  }

  const logtailToken = process.env.DEV_LOGTAIL_SOURCE_TOKEN;
  const axiomToken = process.env.AXIOM_TOKEN;
  const axiomDataset = process.env.AXIOM_DATASET;

  // Streams that ship logs off-box (Logtail / Axiom). Used both by the main
  // logger and by the console-bridge logger.
  const shippingStreams: StreamEntry[] = [];
  // Streams that only render locally (pino-pretty in dev). The console bridge
  // skips these so original console output isn't duplicated in the terminal.
  const localStreams: StreamEntry[] = [];

  if (process.env.NODE_ENV === "development") {
    const pretty = require("pino-pretty");
    localStreams.push({
      stream: pretty({
        colorize: true,
        translateTime: "SYS:standard",
        ignore: "pid,hostname",
      }),
      level: baseLevel,
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
    shippingStreams.push({
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
      level: baseLevel,
    });
  }

  if (axiomToken && axiomDataset) {
    const axiom = createAxiomStream(axiomToken, axiomDataset);
    axiomFlush = axiom.flush;
    shippingStreams.push({
      stream: axiom.stream,
      level: baseLevel,
    });
  }

  // Build the console bridge: forward `console.*` calls to a pino instance
  // wired to *only* the shipping streams. This way every existing
  // `console.log(...)` reaches Axiom/Logtail without duplicating local output.
  if (shippingStreams.length > 0) {
    installConsoleBridge(
      pino({ level: baseLevel }, pino.multistream(shippingStreams)) as Logger,
    );
  }

  const streams = [...localStreams, ...shippingStreams];
  if (streams.length > 0) {
    return pino({ level: baseLevel }, pino.multistream(streams)) as Logger;
  }

  return pino({ level: baseLevel }) as Logger;
};

// Use a global marker so the bridge is installed at most once across all
// module instances. Next.js dev (HMR, RSC, API workers, etc.) can re-evaluate
// this file multiple times in the same process; without this guard each
// instance would wrap the already-wrapped console, multiplying every line.
const CONSOLE_BRIDGE_FLAG = Symbol.for("maimai-charts.logger.consoleBridgeInstalled");
function installConsoleBridge(shipLogger: Logger) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = globalThis as any;
  if (g[CONSOLE_BRIDGE_FLAG]) return;
  g[CONSOLE_BRIDGE_FLAG] = true;

  const map: Array<[keyof Console, "trace" | "debug" | "info" | "warn" | "error"]> = [
    ["log", "info"],
    ["info", "info"],
    ["warn", "warn"],
    ["error", "error"],
    ["debug", "debug"],
    ["trace", "trace"],
  ];

  for (const [method, level] of map) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orig = (console as any)[method].bind(console);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (console as any)[method] = (...args: unknown[]) => {
      orig(...args);
      try {
        const msg = args
          .map((a) => {
            if (typeof a === "string") return a;
            if (a instanceof Error) return a.stack ?? a.message;
            try { return JSON.stringify(a); } catch { return String(a); }
          })
          .join(" ");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (shipLogger as any)[level]({ via: "console" }, msg);
      } catch {
        // never let logging break the app
      }
    };
  }
}

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

const FLUSH_TIMEOUT_MS = 250;

// Resolve when `op` settles or after `timeoutMs`, whichever comes first — a
// stalled provider must never hold up request completion when flushLogger() is
// awaited in a route's finally. Errors are swallowed (best effort).
async function settleWithTimeout(op: Promise<void> | undefined, timeoutMs = FLUSH_TIMEOUT_MS): Promise<void> {
  if (!op) return;
  await new Promise<void>((resolve) => {
    const t = setTimeout(resolve, timeoutMs);
    op.then(() => { }, () => { }).finally(() => {
      clearTimeout(t);
      resolve();
    });
  });
}

export async function flushLogger(): Promise<void> {
  // A log flush must never break or stall a request: bound each provider flush
  // with a timeout and swallow errors, so neither a rejection nor a hang can
  // affect a handler's response when awaited in a finally.
  await Promise.all([
    settleWithTimeout(logtailInstance?.flush()),
    settleWithTimeout(axiomFlush?.()),
  ]);
}
