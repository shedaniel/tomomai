import { NextRequest, NextResponse } from "next/server";
import { RateLimiterRedis, RateLimiterRes } from "rate-limiter-flexible";
import { redis } from "@/lib/redis";
import { logger } from "../logger";
import { TIER_I } from "@/lib/api/tiers";

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

/** Extracts client IP from common proxy headers. Vercel sets x-forwarded-for. */
export function clientIp(req: NextRequest): string {
  const raw =
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for") ??
    req.headers.get("x-real-ip") ??
    "unknown";
  return raw.split(",")[0].trim();
}

/**
 * Redis-backed rate limiter using rate-limiter-flexible's atomic Lua scripts.
 * One Redis round-trip per check.
 */
export class RedisRateLimiter {
  private limiter: RateLimiterRedis;
  private max: number;
  private failClosed: boolean;
  private windowSeconds: number;

  constructor(opts: RateLimitOptions) {
    this.max = opts.max;
    this.failClosed = opts.failClosed ?? false;
    this.windowSeconds = opts.windowSeconds;
    this.limiter = new RateLimiterRedis({
      storeClient: redis,
      keyPrefix: `rl:${opts.name}`,
      points: opts.max,
      duration: opts.windowSeconds,
      blockDuration: opts.blockSeconds ?? opts.windowSeconds,
    });
  }

  async check(key: string, cost: number = 1): Promise<RateLimitResult> {
    try {
      const res = await this.limiter.consume(key, cost);
      return this.buildResult(res, false);
    } catch (err) {
      if (err instanceof RateLimiterRes) {
        return this.buildResult(err, true);
      }
      // Redis unreachable or other error.
      if (this.failClosed) {
        logger.error({ err, key }, "Rate limiter error — failing closed");
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
      logger.error({ err, key }, "Rate limiter error — failing open");
      return {
        limited: false,
        remaining: this.max,
        limit: this.max,
        retryAfter: 0,
        headers: {},
      };
    }
  }

  /** Refund previously-consumed points (e.g. when a later limiter rejects). */
  async reward(key: string, cost: number = 1): Promise<void> {
    try {
      await this.limiter.reward(key, cost);
    } catch (err) {
      logger.error({ err, key }, "Rate limiter reward failed");
    }
  }

  async checkRequest(req: NextRequest): Promise<RateLimitResult> {
    return this.check(clientIp(req));
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

// --- Shared limiter instances ---

/** Global API protection, broad, applied via middleware. */
export const apiLimiter = new RedisRateLimiter({
  name: "api",
  windowSeconds: 60,
  max: 180,
});

/** Auth endpoints, stricter than general API. */
export const authLimiter = new RedisRateLimiter({
  name: "auth",
  windowSeconds: 90,
  max: 10,
  failClosed: true,
});

/** Captcha challenge creation */
export const captchaChallengeLimiter = new RedisRateLimiter({
  name: "captcha-challenge",
  windowSeconds: 60,
  max: 5,
});

/** Captcha pre-verify, UX only, looser. */
export const captchaVerifyLimiter = new RedisRateLimiter({
  name: "captcha-verify",
  windowSeconds: 60,
  max: 10,
});

/** Per-API-key burst limiter for `/api/v1/*`. */
export const apiKeyLimiter = new RedisRateLimiter({
  name: "api-key",
  windowSeconds: TIER_I.perKeyBurst.windowSeconds,
  max: TIER_I.perKeyBurst.max,
});

/** Per-user umbrella burst limiter for `/api/v1/*` — closes multi-key bypass. */
export const apiUserLimiter = new RedisRateLimiter({
  name: "api-user",
  windowSeconds: TIER_I.perUserBurst.windowSeconds,
  max: TIER_I.perUserBurst.max,
});

/** Passkey registration — the abuse outcome. Very strict, long block. */
export const passkeyRegisterLimiter = new RedisRateLimiter({
  name: "passkey-register",
  windowSeconds: 60 * 60,
  max: 3,
  blockSeconds: 60 * 60,
  failClosed: true,
});
