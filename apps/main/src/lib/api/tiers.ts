/**
 * API v1 rate-limit tiers. Single-tier today (Tier I); the shape leaves room
 * for `tierOf(userId)` to return a different tier per user later.
 */
export const TIER_I = {
  perKeyBurst: { windowSeconds: 60, max: 80 },
  perUserBurst: { windowSeconds: 60, max: 120 },
  monthlyQuota: 40_000,
} as const;

export type Tier = typeof TIER_I;

export function tierOf(_userId: string): Tier {
  return TIER_I;
}
