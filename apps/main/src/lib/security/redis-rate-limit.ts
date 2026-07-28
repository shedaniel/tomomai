import {
  RedisRateLimiter,
  clientIp,
  clientIpFromHeaders,
  rateLimit,
} from "@tomomai/security/rate-limit";
import { logger } from "../logger";
import { TIER_I } from "@/lib/api/tiers";

export type {
  RateLimitOptions,
  RateLimitResult,
} from "@tomomai/security/rate-limit";
export { RedisRateLimiter, clientIp, clientIpFromHeaders, rateLimit };

// --- Shared limiter instances ---

/** Global API protection, broad, applied via middleware. */
export const apiLimiter = new RedisRateLimiter({
  name: "api",
  windowSeconds: 60,
  max: 180,
  logger,
});

/** Auth endpoints, stricter than general API. */
export const authLimiter = new RedisRateLimiter({
  name: "auth",
  windowSeconds: 240,
  max: 10,
  failClosed: true,
  logger,
});

/** Captcha challenge creation */
export const captchaChallengeLimiter = new RedisRateLimiter({
  name: "captcha-challenge",
  windowSeconds: 60,
  max: 5,
  logger,
});

/** Captcha pre-verify, UX only, looser. */
export const captchaVerifyLimiter = new RedisRateLimiter({
  name: "captcha-verify",
  windowSeconds: 60,
  max: 10,
  logger,
});

/** Per-API-key burst limiter for `/api/v1/*`. */
export const apiKeyLimiter = new RedisRateLimiter({
  name: "api-key",
  windowSeconds: TIER_I.perKeyBurst.windowSeconds,
  max: TIER_I.perKeyBurst.max,
  logger,
});

/** Per-user umbrella burst limiter for `/api/v1/*` — closes multi-key bypass. */
export const apiUserLimiter = new RedisRateLimiter({
  name: "api-user",
  windowSeconds: TIER_I.perUserBurst.windowSeconds,
  max: TIER_I.perUserBurst.max,
  logger,
});

/** Passkey registration — the abuse outcome. Very strict, long block. */
export const passkeyRegisterLimiter = new RedisRateLimiter({
  name: "passkey-register",
  windowSeconds: 60 * 60,
  max: 3,
  blockSeconds: 60 * 60,
  failClosed: true,
  logger,
});
