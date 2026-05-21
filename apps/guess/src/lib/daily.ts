import type { Chart, Hint, HintKind } from "./types";
import { TOTAL_STEPS } from "./types";
import { HINT_META, IMAGE_KINDS, STEP0_KINDS } from "./hints-meta";
import { Rng } from "./rng";

// Date helpers were moved to `date-slug.ts`; re-export here so existing
// importers (`@/lib/daily`) keep working without churn.
export {
  getDateKey,
  getRealTodayKey,
  parsePastDateSlug,
  isTodaySlug,
} from "./date-slug";

// ---------- Chart picker --------------------------------------------------

/**
 * Per-chart weight used when picking today's song. Higher numbers = more
 * likely. The sweet-spot ranges (well-known canonical charts) get a boost;
 * everything else stays at 1× so the long tail is still possible.
 */
function songWeight(c: Chart): number {
  const lp = c.levelPrecise;
  if (c.difficulty === "expert") {
    return lp >= 12.0 && lp <= 14.0 ? 3.0 : 1.0;
  }
  // master / remaster (basic / advanced / utage are filtered upstream)
  return lp >= 13.0 && lp <= 15.0 ? 3.0 : 1.0;
}

export function pickDailyChart(pool: readonly Chart[], dateKey: string): Chart {
  if (pool.length === 0) throw new Error("Empty song pool");
  const rng = new Rng(`${dateKey}:song`);
  const weights = pool.map(songWeight);
  return rng.pickWeighted(pool, weights);
}

// ---------- Step plan -----------------------------------------------------

/**
 * Build a step plan deterministically from (dateKey, chart). Plan length is
 * HINT_COUNT (the +1 reveal step is rendered separately).
 *
 * - Step 0 is forced to be a cover-art image hint, drawn from STEP0_KINDS.
 * - Step 1 is forced blinds@0 OR blinds-h@0 (random of the two).
 * - Steps 2..HINT_COUNT-1: bias toward introducing new kinds when few have been
 *   seen, drawing from the candidate pool. Each kind has a min-step gate, an
 *   optional `gatedBy(chart)` predicate, and mutually exclusive pairs.
 */
export function buildStepPlan(chart: Chart, dateKey: string): Hint[] {
  const rng = new Rng(`${dateKey}:steps`);

  const step0Kind = rng.pick(STEP0_KINDS);
  const step1Kind: HintKind = rng.float() < 0.5 ? "blinds" : "blinds-h";
  const plan: Hint[] = [
    { kind: step0Kind, level: 0 } as Hint,
    { kind: step1Kind, level: 0 } as Hint,
  ];

  const allCandidates: HintKind[] = (Object.values(HINT_META))
    .filter((e) => e.inGeneralPool && (!e.gatedBy || e.gatedBy(chart)))
    .map((e) => e.kind);

  // current level per kind (-1 if not introduced yet)
  const cur = new Map<HintKind, number>();
  for (const h of plan) cur.set(h.kind, h.level);

  const isEligibleAt = (k: HintKind, step: number) => {
    const entry = HINT_META[k];
    if ((entry.minStep ?? 0) > step) return false;
    if (entry.exclusiveWith && cur.has(entry.exclusiveWith)) return false;
    return true;
  };

  const baseWeight = (k: HintKind): number => HINT_META[k].weight ?? 1;

  for (let step = 2; step <= TOTAL_STEPS - 2; step++) {
    const advanceable = [...cur.entries()].filter(
      ([k, v]) => allCandidates.includes(k) && v < HINT_META[k].maxLevel,
    );
    const fresh = allCandidates.filter((k) => !cur.has(k) && isEligibleAt(k, step));

    // Probability of introducing a fresh kind. Slides from ~1.0 down to a
    // floor of 0.3 as more types are introduced.
    const introducedCount = allCandidates.filter((k) => cur.has(k)).length;
    const pNew = Math.max(0.3, 1 - introducedCount / allCandidates.length);

    let chosen: { kind: HintKind; level: number };
    const wantNew =
      fresh.length > 0 && (advanceable.length === 0 || rng.float() < pNew);
    if (wantNew) {
      const freshWeights = fresh.map(baseWeight);
      const k = rng.pickWeighted(fresh, freshWeights);
      chosen = { kind: k, level: HINT_META[k].lateIntroLevel ?? 0 };
    } else if (advanceable.length > 0) {
      // Boost image kinds higher than text kinds when advancing. The boost
      // scales with how many kinds we've introduced — early on, advancing a
      // text kind is fine; later, the deck is text-heavy, so pushing image
      // hints to their next level is the only way to keep adding visual
      // difficulty.
      const imageBoost = 1 + introducedCount * 0.6;
      const weights = advanceable.map(([k]) =>
        IMAGE_KINDS.has(k) ? imageBoost : baseWeight(k),
      );
      const [kind, lv] = rng.pickWeighted(advanceable, weights);
      chosen = { kind, level: lv + 1 };
    } else if (fresh.length > 0) {
      const freshWeights = fresh.map(baseWeight);
      const k = rng.pickWeighted(fresh, freshWeights);
      chosen = { kind: k, level: HINT_META[k].lateIntroLevel ?? 0 };
    } else {
      // Truly nothing eligible — degenerate case, pad with genre.
      chosen = { kind: "genre", level: 0 };
    }
    cur.set(chosen.kind, chosen.level);
    plan.push(chosen as Hint);
  }

  return plan;
}
