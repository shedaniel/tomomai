import type { Chart, HintKind } from "./types";

/**
 * Per-kind metadata that the *client* may need (plus the structural fields
 * the planner reads). No transform or describe functions live here — those
 * pull in `sharp` and `node:crypto` and are server-only. Behavioural code
 * lives in `hints-registry.ts` (server-only) and reads this map.
 *
 * Splitting client-safe metadata from server-only behaviour keeps the
 * registry as a single source of truth without dragging sharp into the
 * client bundle.
 */

/**
 * Decides whether this kind is eligible at `hintNum`, and at what level.
 * Returning `null` means "not eligible at this slot" — the planner skips
 * the kind for this iteration.
 *
 * Consolidates what used to be five fields: `maxLevel`, `step0Eligible`,
 * `inGeneralPool`, `lateIntroLevel`, and `notOnFinalHint`. Use `stdLevel`
 * for the common shape; replace with a custom function for bespoke logic.
 *
 * @param hintNum   0-indexed hint slot (0..maxHints-1).
 * @param maxHints  Total hint slots before reveal (TOTAL_STEPS - 1).
 * @param prevLevel Current level of this kind in the plan, or `null` if
 *                  not yet introduced.
 */
export type LevelFn = (
  hintNum: number,
  maxHints: number,
  prevLevel: number | null,
) => number | null;

export type HintMeta = {
  kind: HintKind;
  /** Image hint (has an `/api/chart/:step/image` representation). */
  isImage: boolean;
  /** Earliest hint slot this kind is allowed to first appear at. */
  minStep?: number;
  /** Hint kind that mutually excludes this one (e.g. blinds ↔ blinds-h). */
  exclusiveWith?: HintKind;
  /** Extra inclusion gate based on chart fields (e.g. bpm not null). */
  gatedBy?: (chart: Chart) => boolean;
  /** Per-kind base weight in the planner. Default 1. */
  weight?: number;
  /** See {@link LevelFn}. */
  level: LevelFn;
};

type StdLevelOpts = {
  /** Cap (inclusive). Advancing past this returns null. */
  max: number;
  /** Eligible to be the forced step-0 cover-art pick. */
  step0?: boolean;
  /** Excluded from the general pool (slots ≥ 2). */
  excludeGeneral?: boolean;
  /**
   * Level when first introduced at slot ≥ 2 (cold mid-game intro).
   * Default 0. Use this when starting fresh at L0 mid-game would feel
   * like a regression — e.g. pixelate L0 is a 4×4 grid only meant for
   * the opening hint, so introducing it cold at step 5 should be L1.
   */
  lateIntro?: number;
  /** Disallow on the final pre-reveal slot (too weak as a closer). */
  notOnFinal?: boolean;
};

/**
 * Default {@link LevelFn} builder. Covers the standard "intro at L0 (or
 * lateIntro), advance by 1 each time, cap at `max`" shape. For bespoke
 * per-kind behaviour, write a `LevelFn` by hand instead.
 */
export function stdLevel(opts: StdLevelOpts): LevelFn {
  const { max, step0, excludeGeneral, lateIntro, notOnFinal } = opts;
  return (hintNum, maxHints, prev) => {
    if (notOnFinal && hintNum === maxHints - 1) return null;
    if (prev === null) {
      // Cold introduction at this slot.
      if (hintNum === 0) return step0 ? 0 : null;
      if (excludeGeneral) return null;
      return lateIntro ?? 0;
    }
    // Advancement.
    if (prev >= max) return null;
    return prev + 1;
  };
}

export const HINT_META: Record<HintKind, HintMeta> = {
  pixelate: {
    kind: "pixelate",
    isImage: true,
    // L0 (4×4 grid) is only meant as an opening hint; if pixelate is first
    // introduced mid-game, skip straight to L1.
    level: stdLevel({ max: 2, step0: true, lateIntro: 1 }),
  },
  blinds: {
    kind: "blinds",
    isImage: true,
    exclusiveWith: "blinds-h",
    level: stdLevel({ max: 1 }),
  },
  "blinds-h": {
    kind: "blinds-h",
    isImage: true,
    exclusiveWith: "blinds",
    level: stdLevel({ max: 1 }),
  },
  crop: {
    kind: "crop",
    isImage: true,
    level: stdLevel({ max: 2, step0: true }),
  },
  "shuffle-move": {
    kind: "shuffle-move",
    isImage: true,
    level: stdLevel({ max: 2, step0: true }),
  },
  posterize: {
    kind: "posterize",
    isImage: true,
    level: stdLevel({ max: 1, step0: true }),
  },
  "edge-detect": {
    kind: "edge-detect",
    isImage: true,
    level: stdLevel({ max: 1 }),
  },
  length: {
    kind: "length",
    isImage: false,
    level: stdLevel({ max: 1 }),
  },
  difficulty: {
    kind: "difficulty",
    isImage: false,
    // Difficulty alone leaves the player with hundreds of candidates — a
    // weak closing clue. Allow earlier in the run but not in the final slot.
    level: stdLevel({ max: 1, notOnFinal: true }),
  },
  bpm: {
    kind: "bpm",
    isImage: false,
    // BPM range is a weak hint — underweight so it appears less often.
    weight: 0.35,
    gatedBy: (chart) => chart.bpm != null,
    level: stdLevel({ max: 2 }),
  },
  genre: {
    kind: "genre",
    isImage: false,
    level: stdLevel({ max: 0 }),
  },
  "game-version": {
    kind: "game-version",
    isImage: false,
    minStep: 3,
    level: stdLevel({ max: 0 }),
  },
  artist: {
    kind: "artist",
    isImage: false,
    minStep: 2,
    level: stdLevel({ max: 1 }),
  },
  "note-designer": {
    kind: "note-designer",
    isImage: false,
    // Niche flavour, only some players track designers — keep occasional.
    weight: 0.35,
    gatedBy: (chart) =>
      chart.noteDesigner != null &&
      (chart.difficulty === "master" || chart.difficulty === "remaster"),
    level: stdLevel({ max: 0 }),
  },
};

export const ALL_HINT_KINDS: HintKind[] = Object.keys(HINT_META) as HintKind[];

/** Image-rendered hint kinds — these have a corresponding /image route. */
export const IMAGE_KINDS: ReadonlySet<HintKind> = new Set(
  ALL_HINT_KINDS.filter((k) => HINT_META[k].isImage),
);

/**
 * Kinds eligible to appear at step 0. Derived from each kind's `level()`
 * returning a non-null value when called with `hintNum=0, prevLevel=null`.
 * `maxHints` is passed in because it varies with `TOTAL_STEPS`.
 */
export function step0Kinds(maxHints: number): HintKind[] {
  return ALL_HINT_KINDS.filter((k) => HINT_META[k].level(0, maxHints, null) !== null);
}
