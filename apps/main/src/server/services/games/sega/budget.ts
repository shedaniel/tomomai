import "server-only";
import { getRedis } from "@tomomai/security/redis";
import { RateLimiterRedis, RateLimiterRes } from "rate-limiter-flexible";
import { logger } from "@/lib/logger";
import { CANONICAL_GAME_IDS, type CanonicalGameId, type Region } from "@/lib/games/ids";
import { getGame } from "@/lib/games/registry";
import type { GameSite } from "@/lib/games/types";
import { GameSiteBusyError, GameSiteLockedError } from "./errors";

// SEGA's NETs lock a client out (ERROR CODE 200001) after too many requests in
// a short period, and all instances share a few egress IPs, so every request
// to a site that signs in SEGA players draws from one Redis-backed budget per
// host. The rate and lock length can be set per site:
// <GAME>_<REGION>_REQUESTS_PER_SECOND and <GAME>_LOCK_SECONDS.
const DEFAULT_REQUESTS_PER_SECOND = 5;
const DEFAULT_LOCK_SECONDS = 300;
// How long after the budget last ran out the host still counts as busy.
const BUSY_SECONDS = 60;
const MAX_WAIT_MS = 30_000;
// ioredis keeps retrying a command for seconds while Redis is unreachable, and
// this runs before every site request, so give up quickly and skip the budget
// for a while instead.
const REDIS_TIMEOUT_MS = 500;
const BYPASS_AFTER_FAILURE_MS = 30_000;
let bypassUntil = 0;

type BudgetedSite = { game: CanonicalGameId; region: Region; host: string; requestsPerSecond: number; lockSeconds: number };

function envNumber(name: string, fallback: number): number {
  return Number(process.env[name]) || fallback;
}

let sitesByHost: Map<string, BudgetedSite> | undefined;

// Built on first use, so the registry is complete and tests can set the env first.
function budgetedSites(): Map<string, BudgetedSite> {
  if (sitesByHost) return sitesByHost;
  sitesByHost = new Map();
  for (const game of CANONICAL_GAME_IDS) {
    for (const [region, site] of Object.entries(getGame(game).sites) as [Region, GameSite][]) {
      if (!site.aime && !site.segaId) continue;
      const host = new URL(site.origin).hostname;
      sitesByHost.set(host, {
        game,
        region,
        host,
        requestsPerSecond: envNumber(`${game.toUpperCase()}_${region.toUpperCase()}_REQUESTS_PER_SECOND`, DEFAULT_REQUESTS_PER_SECOND),
        lockSeconds: envNumber(`${game.toUpperCase()}_LOCK_SECONDS`, DEFAULT_LOCK_SECONDS),
      });
    }
  }
  return sitesByHost;
}

/** The budgeted site a URL belongs to, or null for hosts outside the budget. */
export function budgetedSite(url: string): BudgetedSite | null {
  try {
    return budgetedSites().get(new URL(url).hostname) ?? null;
  } catch {
    return null;
  }
}

// Keys are named by game, so maimai's match the ones deployments before CHUNITHM used.
const lockKey = (site: BudgetedSite) => `${site.game}:locked:${site.host}`;
const busyKey = (site: BudgetedSite) => `${site.game}:busy:${site.host}`;

const limiters = new Map<string, RateLimiterRedis>();

function limiterFor(site: BudgetedSite): RateLimiterRedis | null {
  const redis = getRedis();
  if (!redis) return null;
  let limiter = limiters.get(site.host);
  if (!limiter) {
    limiter = new RateLimiterRedis({
      storeClient: redis,
      keyPrefix: `${site.game}-budget:${site.host}`,
      points: site.requestsPerSecond,
      duration: 1,
    });
    limiters.set(site.host, limiter);
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
  logger.warn({ err: error, url }, "Game site request budget unavailable, not throttling");
}

/**
 * Waits for a slot in the host's shared request budget. Throws GameSiteLockedError
 * while the site has us locked out, and GameSiteBusyError if no slot frees up in
 * time. Requests to other hosts, and environments without Redis, pass through.
 */
export async function takeSiteRequest(url: string): Promise<void> {
  const site = budgetedSite(url);
  if (!site || Date.now() < bypassUntil) return;
  const redis = getRedis();
  const limiter = limiterFor(site);
  if (!redis || !limiter) return;

  const deadline = Date.now() + MAX_WAIT_MS;
  for (;;) {
    let lockTtl: number;
    let outcome: RateLimiterRes | unknown;
    try {
      [lockTtl, outcome] = await withTimeout(Promise.all([
        redis.ttl(lockKey(site)),
        limiter.consume("all").then(() => null, (rejection: unknown) => rejection),
      ]));
    } catch (error) {
      bypassBudget(error, url);
      return;
    }
    if (lockTtl > 0) throw new GameSiteLockedError(site.game, lockTtl);
    if (outcome === null) return;
    if (!(outcome instanceof RateLimiterRes)) {
      bypassBudget(outcome, url);
      return;
    }

    void redis.set(busyKey(site), "1", "EX", BUSY_SECONDS).catch(() => undefined);
    const waitMs = outcome.msBeforeNext + Math.random() * 50;
    if (Date.now() + waitMs > deadline) throw new GameSiteBusyError(site.game);
    await sleep(waitMs);
  }
}

/** Records that the site locked us out, so every instance stops sending for a while. */
export async function markSiteLocked(url: string): Promise<void> {
  const site = budgetedSite(url);
  if (!site) return;
  const redis = getRedis();
  if (!redis) return;
  try {
    await withTimeout(redis.set(lockKey(site), "1", "EX", site.lockSeconds));
    logger.warn({ url }, `${getGame(site.game).brand.netName} locked us out; pausing requests to ${site.host} for ${site.lockSeconds}s`);
  } catch (error) {
    logger.warn({ err: error, url }, "Failed to record game site lock");
  }
}

export interface GameSiteStatus {
  locked: boolean;
  retryAfterSeconds: number;
  busy: boolean;
}

const IDLE_STATUS: GameSiteStatus = { locked: false, retryAfterSeconds: 0, busy: false };

/** Lock and load state of a game's site in a region, for warning users before they fetch. */
export async function getGameSiteStatus(game: CanonicalGameId, region: Region): Promise<GameSiteStatus> {
  const site = [...budgetedSites().values()].find(candidate => candidate.game === game && candidate.region === region);
  const redis = site ? getRedis() : null;
  if (!site || !redis) return IDLE_STATUS;
  try {
    const [lockTtl, busy] = await withTimeout(Promise.all([redis.ttl(lockKey(site)), redis.exists(busyKey(site))]));
    return { locked: lockTtl > 0, retryAfterSeconds: Math.max(0, lockTtl), busy: busy === 1 };
  } catch (error) {
    logger.warn({ err: error, game, region }, "Failed to read game site status");
    return IDLE_STATUS;
  }
}
