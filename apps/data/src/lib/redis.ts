import { getRedis } from "@tomomai/security/redis";
import type Redis from "ioredis";

// Lazy variant of apps/main's redis singleton: still requires REDIS_URL, but
// throws on first use instead of at import time, so modules that merely
// import a route transitively (e.g. tests of pure helpers) don't need Redis.
let client: Redis | null = null;

function resolveClient(): Redis {
  if (!client) {
    const r = getRedis();
    if (!r) {
      throw new Error("REDIS_URL is required");
    }
    client = r;
  }
  return client;
}

export const redis: Redis = new Proxy({} as Redis, {
  get(_target, prop) {
    const r = resolveClient();
    const value = (r as unknown as Record<PropertyKey, unknown>)[prop];
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(r) : value;
  },
});
