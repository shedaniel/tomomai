/**
 * Animation slowdown for debugging. Set `NEXT_PUBLIC_DEBUG_ANIMATION` in
 * `apps/guess/.env.local` to any positive number (e.g. `8`) to make all
 * Framer Motion transitions run that many times slower. Useful for visually
 * inspecting animation timing & detecting glitches.
 *
 * Wrapping in `NEXT_PUBLIC_*` so the value is inlined into the client
 * bundle at build time — `process.env` access on the client only sees those.
 *
 * How the slowdown works:
 * - Spring transitions: scale stiffness by 1/k², damping by 1/k. Springs'
 *   period of oscillation is ∝ √(mass/stiffness), so dividing stiffness by k²
 *   slows the period by k. Dividing damping by k preserves the damping ratio
 *   so the animation still feels "gentle" / "snappy" / etc., just slower.
 * - Tweens: multiply `duration` and `delay` by k.
 */
const RAW = process.env.NEXT_PUBLIC_DEBUG_ANIMATION;

export const ANIMATION_SLOWDOWN: number = (() => {
  if (!RAW) return 1;
  const n = Number.parseFloat(RAW);
  return Number.isFinite(n) && n > 0 ? n : 8;
})();

type TransitionLike = Record<string, unknown>;

export function debugTransition<T extends TransitionLike>(t: T): T {
  if (ANIMATION_SLOWDOWN === 1) return t;
  const k = ANIMATION_SLOWDOWN;
  const out: TransitionLike = { ...t };
  if (out.type === "spring") {
    if (typeof out.stiffness === "number") out.stiffness = out.stiffness / (k * k);
    if (typeof out.damping === "number") out.damping = out.damping / k;
    if (typeof out.mass === "number") out.mass = out.mass * (k * k);
  }
  if (typeof out.duration === "number") out.duration = out.duration * k;
  if (typeof out.delay === "number") out.delay = out.delay * k;
  return out as T;
}
