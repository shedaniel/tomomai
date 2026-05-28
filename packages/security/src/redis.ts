import Redis from "ioredis";

/**
 * Lazy Redis client. Returns `null` when `REDIS_URL` is unset so callers can
 * gracefully no-op (e.g. local dev or self-hosted deployments without Redis).
 *
 * An `error` listener is attached unconditionally so transient connection
 * errors (ECONNRESET, ETIMEDOUT, etc.) don't surface as "Unhandled error
 * event" stack traces — ioredis emits them on every retry. The rate limiter
 * fails open when a command actually errors, so the client being briefly
 * unhealthy doesn't break routes.
 */
let cached: Redis | null | undefined;
let warned = false;

export function getRedis(): Redis | null {
  if (cached !== undefined) return cached;
  const url = process.env.REDIS_URL;
  if (!url) {
    cached = null;
    return null;
  }
  const client = new Redis(url);
  client.on("error", (err) => {
    if (!warned) {
      warned = true;
      console.warn(
        `[security/redis] connection error (${(err as Error).message}). ` +
          `Further errors suppressed; rate limiting will fail open while Redis is unreachable.`,
      );
    }
  });
  cached = client;
  return cached;
}
