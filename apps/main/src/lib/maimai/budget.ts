import { getRedis } from "@tomomai/security/redis";
import { RateLimiterRedis, RateLimiterRes } from "rate-limiter-flexible";
import { logger } from "../logger";
import type { Region } from "../types";
import { MaimaiBusyError, MaimaiLockedError } from "./errors";

// maimai DX NET locks a client out (ERROR CODE 200001) after too many requests
// in a short period, and all instances share a few egress IPs, so every
// request to a maimai host draws from one Redis-backed budget per host.
const HOSTS: Record<string, Region> = {
  "maimaidx-eng.com": "intl",
  "maimaidx.jp": "jp",
};
const REQUESTS_PER_SECOND: Record<string, number> = {
  "maimaidx-eng.com": Number(process.env.MAIMAI_INTL_REQUESTS_PER_SECOND) || 5,
  "maimaidx.jp": Number(process.env.MAIMAI_JP_REQUESTS_PER_SECOND) || 5,
};
const LOCK_SECONDS = Number(process.env.MAIMAI_LOCK_SECONDS) || 300;
// How long after the budget last ran out the host still counts as busy.
const BUSY_SECONDS = 60;
const MAX_WAIT_MS = 30_000;
// ioredis keeps retrying a command for seconds while Redis is unreachable, and
// this runs before every maimai request, so give up quickly and skip the
// budget for a while instead.
const REDIS_TIMEOUT_MS = 500;
const BYPASS_AFTER_FAILURE_MS = 30_000;
let bypassUntil = 0;

const lockKey = (host: string) => `maimai:locked:${host}`;
const busyKey = (host: string) => `maimai:busy:${host}`;

const limiters = new Map<string, RateLimiterRedis>();

function budgetedHost(url: string): string | null {
  try {
    const host = new URL(url).hostname;
    return host in HOSTS ? host : null;
  } catch {
    return null;
  }
}

function limiterFor(host: string): RateLimiterRedis | null {
  const redis = getRedis();
  if (!redis) return null;
  let limiter = limiters.get(host);
  if (!limiter) {
    limiter = new RateLimiterRedis({
      storeClient: redis,
      keyPrefix: `maimai-budget:${host}`,
      points: REQUESTS_PER_SECOND[host],
      duration: 1,
    });
    limiters.set(host, limiter);
  }
  return limiter;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Redis did not answer within ${REDIS_TIMEOUT_MS}ms`)), REDIS_TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function bypassBudget(error: unknown, url: string): void {
  bypassUntil = Date.now() + BYPASS_AFTER_FAILURE_MS;
  logger.warn({ err: error, url }, "maimai request budget unavailable, not throttling");
}

/**
 * Waits for a slot in the host's shared request budget. Throws MaimaiLockedError
 * while maimai has us locked out, and MaimaiBusyError if no slot frees up in
 * time. Requests to other hosts, and environments without Redis, pass through.
 */
export async function takeMaimaiRequest(url: string): Promise<void> {
  const host = budgetedHost(url);
  if (!host || Date.now() < bypassUntil) return;
  const redis = getRedis();
  const limiter = limiterFor(host);
  if (!redis || !limiter) return;

  const deadline = Date.now() + MAX_WAIT_MS;
  for (;;) {
    let lockTtl: number;
    let outcome: RateLimiterRes | unknown;
    try {
      [lockTtl, outcome] = await withTimeout(Promise.all([
        redis.ttl(lockKey(host)),
        limiter.consume("all").then(() => null, (rejection: unknown) => rejection),
      ]));
    } catch (error) {
      bypassBudget(error, url);
      return;
    }
    if (lockTtl > 0) throw new MaimaiLockedError(lockTtl);
    if (outcome === null) return;
    if (!(outcome instanceof RateLimiterRes)) {
      bypassBudget(outcome, url);
      return;
    }

    void redis.set(busyKey(host), "1", "EX", BUSY_SECONDS).catch(() => undefined);
    const waitMs = outcome.msBeforeNext + Math.random() * 50;
    if (Date.now() + waitMs > deadline) throw new MaimaiBusyError();
    await sleep(waitMs);
  }
}

/** Records that maimai locked us out, so every instance stops sending for a while. */
export async function markMaimaiLocked(url: string): Promise<void> {
  const host = budgetedHost(url);
  if (!host) return;
  const redis = getRedis();
  if (!redis) return;
  try {
    await withTimeout(redis.set(lockKey(host), "1", "EX", LOCK_SECONDS));
    logger.warn({ url }, `maimai locked us out; pausing requests to ${host} for ${LOCK_SECONDS}s`);
  } catch (error) {
    logger.warn({ err: error, url }, "Failed to record maimai lock");
  }
}

export interface MaimaiStatus {
  locked: boolean;
  retryAfterSeconds: number;
  busy: boolean;
}

/** Lock and load state for a region's maimai host, for warning users before they fetch. */
export async function getMaimaiStatus(region: Region): Promise<MaimaiStatus> {
  const host = Object.keys(HOSTS).find((candidate) => HOSTS[candidate] === region);
  const redis = host ? getRedis() : null;
  if (!host || !redis) return { locked: false, retryAfterSeconds: 0, busy: false };
  try {
    const [lockTtl, busy] = await withTimeout(Promise.all([redis.ttl(lockKey(host)), redis.exists(busyKey(host))]));
    return { locked: lockTtl > 0, retryAfterSeconds: Math.max(0, lockTtl), busy: busy === 1 };
  } catch (error) {
    logger.warn({ err: error, region }, "Failed to read maimai status");
    return { locked: false, retryAfterSeconds: 0, busy: false };
  }
}
