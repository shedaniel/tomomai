import type { Chart, Hint, HintKind } from "./types";
import { TOTAL_STEPS } from "./types";
import { HINT_META, IMAGE_KINDS, step0Kinds } from "./hints-meta";
import { buildHeardlePlan, hasAudioPreview } from "./heardle";
import { isHeardle } from "./heardle-config";
import { getPuzzleVersion, type PuzzleVersion } from "./puzzle-version";
import { Rng } from "./rng";

/** Audio level used when guess mode promotes the final hint to an audio clue. */
const GUESS_FINAL_AUDIO_LEVEL = 5; // AUDIO_DURATIONS[5] === 16s
/** Probability that the final guess-mode hint is replaced with an audio clip. */
const GUESS_FINAL_AUDIO_CHANCE = 0.5;

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
 * everything else stays at 1× so the long tail is still possible. Older
 * `addedVersion`s are penalised relative to the newest version in the pool so
 * recent songs surface more often.
 */

/**
 * Cap on the oldness exponent. `addedVersion` ranges from ~-13 to the
 * current max, so without a cap the 0.8^oldness multiplier underflows for
 * the oldest charts (0.8^26 ≈ 0.005) and the long tail accumulates an
 * unpredictable amount of weight. Clamping treats everything older than
 * OLDNESS_CAP versions as one "legacy" bucket — a smaller cap means the
 * floor sits at a higher weight (0.8^small > 0.8^large), so legacy charts
 * collectively command more of the pool and obscure picks surface more
 * often. v2 lowers the cap to make the game harder.
 */
const OLDNESS_CAP_V1 = 12;
const OLDNESS_CAP_V2 = 8;

function oldnessCap(version: PuzzleVersion): number {
  return version === 2 ? OLDNESS_CAP_V2 : OLDNESS_CAP_V1;
}

/**
 * Small penalty for titles that are mostly kana. Hiragana/katakana-only
 * titles tend to be Vocaloid/anisong with overlapping naming patterns and
 * are harder to recognise from a cover-art hint — applying a ×0.9 nudges
 * the picker toward more visually-distinctive titles without excluding
 * the kana pool (which is ~25% of the catalogue).
 */
const KANA_PENALTY_THRESHOLD = 0.75;
const KANA_PENALTY_FACTOR = 0.9;

/**
 * Fraction of *letter-like* characters in `s` that are hiragana or
 * katakana. Punctuation, digits, and whitespace are excluded from the
 * denominator so spacing/punctuation can't dilute the ratio. Returns 0
 * when the title has no letter characters at all.
 */
function kanaRatio(s: string): number {
  let kana = 0;
  let letters = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    const isHiragana = cp >= 0x3040 && cp <= 0x309f;
    const isKatakana =
      (cp >= 0x30a0 && cp <= 0x30ff) ||
      (cp >= 0x31f0 && cp <= 0x31ff) ||
      (cp >= 0xff65 && cp <= 0xff9f); // half-width katakana
    const isCJK = (cp >= 0x4e00 && cp <= 0x9fff) || (cp >= 0x3400 && cp <= 0x4dbf);
    const isLatin = (cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a);
    if (isHiragana || isKatakana) {
      kana++;
      letters++;
    } else if (isCJK || isLatin) {
      letters++;
    }
  }
  return letters === 0 ? 0 : kana / letters;
}

function songWeight(c: Chart, maxAddedVersion: number, version: PuzzleVersion): number {
  const lp = c.levelPrecise;
  let w: number;
  if (c.difficulty === "expert") {
    w = lp >= 12.0 && lp <= 14.0 ? 3.0 : 1.0;
  } else {
    // master / remaster (basic / advanced / utage are filtered upstream)
    w = lp >= 13.0 && lp <= 15.0 ? 3.0 : 1.0;
  }
  const oldness = Math.min(oldnessCap(version), Math.max(0, maxAddedVersion - c.addedVersion));
  let weight = w * Math.pow(0.8, oldness);
  if (kanaRatio(c.songName) >= KANA_PENALTY_THRESHOLD) weight *= KANA_PENALTY_FACTOR;
  return weight;
}

export function pickDailyChart(pool: readonly Chart[], dateKey: string): Chart {
  if (pool.length === 0) throw new Error("Empty song pool");
  const rng = new Rng(`${dateKey}:song`);
  const version = getPuzzleVersion(dateKey);
  const maxAddedVersion = pool.reduce((m, c) => Math.max(m, c.addedVersion), 0);
  const weights = pool.map((c) => songWeight(c, maxAddedVersion, version));
  return rng.pickWeighted(pool, weights);
}

// ---------- Step plan -----------------------------------------------------

/**
 * Build a step plan deterministically from (dateKey, chart). Plan length is
 * HINT_COUNT (the +1 reveal step is rendered separately).
 *
 * - Step 0 is forced to be a cover-art image hint, drawn from kinds whose
 *   `level()` returns non-null at `hintNum=0`.
 * - Step 1 is forced blinds@0 OR blinds-h@0 (random of the two).
 * - Steps 2..HINT_COUNT-1: bias toward introducing new kinds when few have been
 *   seen, drawing from the candidate pool. Each kind's eligibility *and*
 *   target level come from its `level()` function; cross-kind structural
 *   gates (`minStep`, `exclusiveWith`, `gatedBy`) are checked alongside.
 */
export function buildStepPlan(chart: Chart, dateKey: string): Hint[] {
  const maxHints = TOTAL_STEPS - 1;
  if (isHeardle()) return buildHeardlePlan(maxHints);
  const rng = new Rng(`${dateKey}:steps`);

  const version = getPuzzleVersion(dateKey);
  const step0Kind = rng.pick(step0Kinds(maxHints));
  const plan: Hint[] = [{ kind: step0Kind, level: 0 } as Hint];

  // v1 forced step 1 to a blinds/blinds-h@0 image hint; v2 drops that and
  // lets step 1 flow through the same weighted selection as later steps,
  // which can land on a much harsher image transform (or a text kind).
  if (version === 1) {
    const step1Kind: HintKind = rng.float() < 0.5 ? "blinds" : "blinds-h";
    plan.push({ kind: step1Kind, level: 0 } as Hint);
  }

  const allCandidates: HintKind[] = (Object.values(HINT_META))
    // Audio is heardle's primary clue; in guess mode it only appears as a
    // special-cased final hint (see the coin flip below), never via the
    // normal weighted selection.
    .filter((e) => e.kind !== "audio")
    .filter((e) => !e.gatedBy || e.gatedBy(chart))
    .map((e) => e.kind);

  // current level per kind (undefined if not introduced yet)
  const cur = new Map<HintKind, number>();
  for (const h of plan) cur.set(h.kind, h.level);

  const baseWeight = (k: HintKind): number => HINT_META[k].weight ?? 1;

  // plan.length already accounts for the forced prefix (1 on v2, 2 on v1),
  // so it's exactly the next step the weighted loop should fill.
  for (let step = plan.length; step <= TOTAL_STEPS - 2; step++) {
    // Special-case the last hint slot: when the chart has an Apple Music
    // preview, flip a coin to replace whatever the planner would have
    // chosen with a 16s audio clip. Audio is excluded from the normal pool
    // (see allCandidates above), so this is the only place it appears in
    // guess mode. Deterministic per dateKey via the same Rng stream.
    if (
      step === TOTAL_STEPS - 2 &&
      hasAudioPreview(chart) &&
      rng.float() < GUESS_FINAL_AUDIO_CHANCE
    ) {
      plan.push({ kind: "audio", level: GUESS_FINAL_AUDIO_LEVEL } as Hint);
      continue;
    }

    // Partition candidates into fresh (cold intro) vs advanceable (already
    // in plan, level can advance). Both use the same level() oracle — null
    // result excludes the kind from either bucket this step.
    const fresh: { kind: HintKind; level: number }[] = [];
    const advanceable: { kind: HintKind; level: number }[] = [];
    for (const k of allCandidates) {
      const meta = HINT_META[k];
      if ((meta.minStep ?? 0) > step) continue;
      if (meta.exclusiveWith && cur.has(meta.exclusiveWith)) continue;
      const prev = cur.get(k);
      const lvl = meta.level(step, maxHints, prev ?? null);
      if (lvl === null) continue;
      if (prev === undefined) fresh.push({ kind: k, level: lvl });
      else advanceable.push({ kind: k, level: lvl });
    }

    // Probability of introducing a fresh kind. Slides from ~1.0 down to a
    // floor of 0.3 as more types are introduced.
    const introducedCount = allCandidates.filter((k) => cur.has(k)).length;
    const pNew = Math.max(0.3, 1 - introducedCount / allCandidates.length);

    let chosen: { kind: HintKind; level: number };
    const wantNew =
      fresh.length > 0 && (advanceable.length === 0 || rng.float() < pNew);
    if (wantNew) {
      const weights = fresh.map((f) => baseWeight(f.kind));
      chosen = rng.pickWeighted(fresh, weights);
    } else if (advanceable.length > 0) {
      // Boost image kinds higher than text kinds when advancing. The boost
      // scales with how many kinds we've introduced — early on, advancing a
      // text kind is fine; later, the deck is text-heavy, so pushing image
      // hints to their next level is the only way to keep adding visual
      // difficulty.
      const imageBoost = 1 + introducedCount * 0.6;
      const weights = advanceable.map((a) =>
        IMAGE_KINDS.has(a.kind) ? imageBoost : baseWeight(a.kind),
      );
      chosen = rng.pickWeighted(advanceable, weights);
    } else if (fresh.length > 0) {
      const weights = fresh.map((f) => baseWeight(f.kind));
      chosen = rng.pickWeighted(fresh, weights);
    } else {
      // Truly nothing eligible — degenerate case, pad with genre.
      chosen = { kind: "genre", level: 0 };
    }
    cur.set(chosen.kind, chosen.level);
    plan.push(chosen as Hint);
  }

  return plan;
}
