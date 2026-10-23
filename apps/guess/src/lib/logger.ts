import { env } from "@/env";
import pino, { type Logger } from "pino";

/** Structured stdout logger; see docs/LOGGING.md for field conventions. */
export const logger: Logger = pino({
  level: env.LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug"),
});
