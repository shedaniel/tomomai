import { db } from "@/lib/db";
import { fetchSessions } from "@/lib/db/schema-pg";
import { and, count, eq, gt, ne, sql } from "drizzle-orm";
import { logger } from "../logger";
import type { Region } from "../types";
import { getMaimaiLock } from "./budget";

// One fetch uses the whole request budget by itself, so maimai only counts as
// busy when other users' fetches are competing for it.
const BUSY_OTHER_FETCHES = 3;
const DURATION_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const DURATION_CACHE_MS = 60 * 60 * 1000;
const DEFAULT_DURATION_SECONDS = 60;
const MIN_DURATION_SECONDS = 30;
const MAX_DURATION_SECONDS = 180;

const durationCache = new Map<Region, { seconds: number; expiresAt: number }>();

export function clampFetchSeconds(measured: number): number {
  if (!Number.isFinite(measured) || measured <= 0) return DEFAULT_DURATION_SECONDS;
  return Math.min(MAX_DURATION_SECONDS, Math.max(MIN_DURATION_SECONDS, measured));
}

async function averageFetchSeconds(region: Region): Promise<number> {
  const cached = durationCache.get(region);
  if (cached && cached.expiresAt > Date.now()) return cached.seconds;

  const [row] = await db
    .select({ seconds: sql<string | null>`extract(epoch from avg(${fetchSessions.completedAt} - ${fetchSessions.startedAt}))` })
    .from(fetchSessions)
    .where(and(
      eq(fetchSessions.region, region),
      eq(fetchSessions.status, "completed"),
      gt(fetchSessions.startedAt, new Date(Date.now() - DURATION_LOOKBACK_MS)),
    ));
  const seconds = clampFetchSeconds(Number(row?.seconds));
  durationCache.set(region, { seconds, expiresAt: Date.now() + DURATION_CACHE_MS });
  return seconds;
}

/**
 * Estimates whether enough other users are fetching in the region to slow a
 * new fetch down. Fetches started within the average fetch duration count as
 * still running, which also leaves out sessions that died while pending.
 */
export async function isMaimaiBusy(region: Region, userId: string): Promise<boolean> {
  try {
    const windowSeconds = await averageFetchSeconds(region);
    const [row] = await db
      .select({ fetches: count() })
      .from(fetchSessions)
      .where(and(
        eq(fetchSessions.region, region),
        gt(fetchSessions.startedAt, new Date(Date.now() - windowSeconds * 1000)),
        ne(fetchSessions.status, "failed"),
        ne(fetchSessions.userId, userId),
      ));
    return (row?.fetches ?? 0) >= BUSY_OTHER_FETCHES;
  } catch (error) {
    logger.warn({ err: error, region }, "Failed to estimate maimai load");
    return false;
  }
}

export interface MaimaiStatus {
  locked: boolean;
  retryAfterSeconds: number;
  busy: boolean;
}

/** Lock and load state for a region's maimai host, for warning users before they fetch. */
export async function getMaimaiStatus(region: Region, userId: string): Promise<MaimaiStatus> {
  const [lock, busy] = await Promise.all([getMaimaiLock(region), isMaimaiBusy(region, userId)]);
  return { ...lock, busy };
}
