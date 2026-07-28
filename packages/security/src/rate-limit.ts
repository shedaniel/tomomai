import { isIP } from "node:net";
import { NextRequest, NextResponse } from "next/server";
import { RateLimiterRedis, RateLimiterRes } from "rate-limiter-flexible";
import { getRedis } from "./redis";

export interface RateLimitOptions {
  /** Bucket name — included in the Redis key. Keep unique per limit. */
  name: string;
  /** Rolling window in seconds. */
  windowSeconds: number;
  /** Max requests allowed within the window. */
  max: number;
  /** Optional block duration in seconds after exceeding the limit. Default = windowSeconds. */
  blockSeconds?: number;
  /** If true, treat Redis errors as rate-limited instead of letting the request through. */
  failClosed?: boolean;
  /** Optional structured logger. Defaults to console.error. */
  logger?: { error: (obj: unknown, msg?: string) => void };
}

export interface RateLimitResult {
  limited: boolean;
  remaining: number;
  /** Window max (points). */
  limit: number;
  /** Seconds until the limit fully resets / block ends. */
  retryAfter: number;
  headers: Record<string, string>;
}

const CLIENT_IP_HEADERS = [
  "x-vercel-forwarded-for",
  "cf-connecting-ip",
  "x-forwarded-for",
  "x-real-ip",
] as const;

type HeaderReader = { get(name: string): string | null };

/** Extracts a validated client IP, preferring headers controlled by Vercel and Cloudflare. */
export function clientIpFromHeaders(headers: HeaderReader): string {
  for (const name of CLIENT_IP_HEADERS) {
    const raw = headers.get(name);
    if (!raw) continue;

    const candidate = raw.split(",")[0]!.trim();
    if (isIP(candidate)) return candidate;
  }

  return "unknown";
}

export function clientIp(req: NextRequest): string {
  return clientIpFromHeaders(req.headers);
}

/**
 * Redis-backed rate limiter using rate-limiter-flexible's atomic Lua scripts.
 * One Redis round-trip per check.
 *
 * When `REDIS_URL` is unset, constructs in a no-op mode: `check()` always
 * resolves to `{ limited: false }`, making this safe to wire into routes even
 * in environments without Redis.
 */
export class RedisRateLimiter {
  private limiter: RateLimiterRedis | null;
  private max: number;
  private windowSeconds: number;
  private failClosed: boolean;
  private logger: { error: (obj: unknown, msg?: string) => void };

  constructor(opts: RateLimitOptions) {
    this.max = opts.max;
    this.windowSeconds = opts.windowSeconds;
    this.failClosed = opts.failClosed ?? false;
    this.logger = opts.logger ?? {
      error: (obj, msg) => console.error(msg ?? "rate-limit error", obj),
    };
    const redis = getRedis();
    this.limiter = redis
      ? new RateLimiterRedis({
          storeClient: redis,
          keyPrefix: `rl:${opts.name}`,
          points: opts.max,
          duration: opts.windowSeconds,
          blockDuration: opts.blockSeconds ?? opts.windowSeconds,
        })
      : null;
  }

  async check(key: string, cost: number = 1): Promise<RateLimitResult> {
    if (!this.limiter) {
      return this.passthrough();
    }
    try {
      const res = await this.limiter.consume(key, cost);
      return this.buildResult(res, false);
    } catch (err) {
      if (err instanceof RateLimiterRes) {
        return this.buildResult(err, true);
      }
      if (this.failClosed) {
        this.logger.error({ err, key }, "Rate limiter error — failing closed");
        return {
          limited: true,
          remaining: 0,
          limit: this.max,
          retryAfter: this.windowSeconds,
          headers: {
            "X-RateLimit-Limit": String(this.max),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(this.windowSeconds),
            "Retry-After": String(this.windowSeconds),
          },
        };
      }
      this.logger.error({ err, key }, "Rate limiter error — failing open");
      return this.passthrough();
    }
  }

  /** Refund previously-consumed points (e.g. when a later limiter rejects). */
  async reward(key: string, cost: number = 1): Promise<void> {
    if (!this.limiter) return;
    try {
      await this.limiter.reward(key, cost);
    } catch (err) {
      this.logger.error({ err, key }, "Rate limiter reward failed");
    }
  }

  async checkRequest(req: NextRequest): Promise<RateLimitResult> {
    return this.check(clientIp(req));
  }

  private passthrough(): RateLimitResult {
    return {
      limited: false,
      remaining: this.max,
      limit: this.max,
      retryAfter: 0,
      headers: {},
    };
  }

  private buildResult(res: RateLimiterRes, limited: boolean): RateLimitResult {
    const retryAfter = Math.ceil(res.msBeforeNext / 1000);
    const remaining = Math.max(0, res.remainingPoints);
    return {
      limited,
      remaining,
      limit: this.max,
      retryAfter,
      headers: {
        "X-RateLimit-Limit": String(this.max),
        "X-RateLimit-Remaining": String(remaining),
        "X-RateLimit-Reset": String(retryAfter),
        ...(limited ? { "Retry-After": String(retryAfter) } : {}),
      },
    };
  }
}

/** Convenience: rate-limit a Next.js route handler by IP. Returns null when OK, a 429 Response when limited. */
export async function rateLimit(
  req: NextRequest,
  limiter: RedisRateLimiter,
  message = "Too many requests, please try again later.",
): Promise<NextResponse | null> {
  const result = await limiter.checkRequest(req);
  if (!result.limited) return null;
  const res = NextResponse.json({ error: message }, { status: 429 });
  Object.entries(result.headers).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}
