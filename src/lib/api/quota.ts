import { redis } from "@/lib/redis";
import { logger } from "@/lib/logger";
import { tierOf } from "./tiers";

export interface QuotaResult {
  ok: boolean;
  used: number;
  limit: number;
  resetAt: Date;
}

const TTL_SECONDS = 35 * 24 * 60 * 60;

function monthKey(userId: string, now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `quota:user:${userId}:${y}${m}`;
}

function nextMonthStartUTC(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0));
}

export async function consumeMonthly(userId: string, cost: number): Promise<QuotaResult> {
  const limit = tierOf(userId).monthlyQuota;
  const resetAt = nextMonthStartUTC();
  const key = monthKey(userId);

  try {
    const used = await redis.incrby(key, cost);
    // Set TTL only on first increment (when used equals cost).
    if (used === cost) {
      await redis.expire(key, TTL_SECONDS);
    }
    if (used > limit) {
      // Refund this request so future cheaper calls aren't permanently blocked.
      await redis.decrby(key, cost);
      return { ok: false, used: used - cost, limit, resetAt };
    }
    return { ok: true, used, limit, resetAt };
  } catch (err) {
    logger.error({ err, userId }, "Monthly quota error — failing open");
    return { ok: true, used: 0, limit, resetAt };
  }
}

export async function refundMonthly(userId: string, cost: number): Promise<void> {
  try {
    await redis.decrby(monthKey(userId), cost);
  } catch (err) {
    logger.error({ err, userId }, "Monthly quota refund failed");
  }
}

export async function peekMonthly(userId: string): Promise<QuotaResult> {
  const limit = tierOf(userId).monthlyQuota;
  const resetAt = nextMonthStartUTC();
  try {
    const raw = await redis.get(monthKey(userId));
    const used = raw ? parseInt(raw, 10) : 0;
    return { ok: used <= limit, used, limit, resetAt };
  } catch (err) {
    logger.error({ err, userId }, "Monthly quota peek failed");
    return { ok: true, used: 0, limit, resetAt };
  }
}
