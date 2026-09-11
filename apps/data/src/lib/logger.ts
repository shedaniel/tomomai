import pino from "pino";
export const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });
export async function flushLogger(): Promise<void> {
  await new Promise<void>((resolve, reject) => logger.flush((err) => err ? reject(err) : resolve()));
}
