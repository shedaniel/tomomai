import { RedisRateLimiter } from "@tomomai/security/rate-limit";

/**
 * Per-IP rate limiter instances for apps/guess.
 *
 * All limiters are no-ops when `REDIS_URL` is unset (see
 * `@tomomai/security/redis`), so local dev / self-hosted deployments without
 * Redis aren't affected.
 *
 * Tune `windowSeconds` / `max` in one place rather than inline at the routes.
 */

/** Type-ahead search — high frequency, cheap per call. */
export const searchLimiter = new RedisRateLimiter({
  name: "guess-search",
  windowSeconds: 10,
  max: 30,
});

/** Guess submission — players don't submit fast; tighter than reads. */
export const submitLimiter = new RedisRateLimiter({
  name: "guess-submit",
  windowSeconds: 60,
  max: 30,
});

/** Site-wide Turnstile verification — one short burst per browser tab. */
export const turnstileVerifyLimiter = new RedisRateLimiter({
  name: "guess-turnstile-verify",
  windowSeconds: 60,
  max: 10,
});

/**
 * Shared bucket for read routes: /api/today, /api/chart/[step],
 * /api/chart/[step]/image. A single page load fires ~12 reads (today + ~6
 * chart metadata + image preloads); 180/min covers casual browsing of
 * multiple past days without throttling real players.
 */
export const readLimiter = new RedisRateLimiter({
  name: "guess-read",
  windowSeconds: 60,
  max: 180,
});
