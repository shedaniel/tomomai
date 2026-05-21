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
export type HintMeta = {
  kind: HintKind;
  /** Image hint (has an `/api/chart/:step/image` representation). */
  isImage: boolean;
  /** Highest valid `level` for this kind (inclusive). */
  maxLevel: number;
  /** Earliest step index this kind is allowed to first appear at. */
  minStep?: number;
  /** Hint kind that mutually excludes this one (e.g. blinds ↔ blinds-h). */
  exclusiveWith?: HintKind;
  /** Eligible for the step-0 random cover-art pool. */
  step0Eligible?: boolean;
  /** Eligible to appear in steps 2.. (the general candidate pool). */
  inGeneralPool: boolean;
  /** Extra inclusion gate based on chart fields (e.g. bpm not null). */
  gatedBy?: (chart: Chart) => boolean;
  /** Per-kind base weight in the planner. Default 1. */
  weight?: number;
  /**
   * Level to start at when the kind is *first introduced* by the planner at
   * step ≥ 2 (i.e. as a fresh pick, not via the forced step-0 / step-1 slots).
   * Defaults to 0. Use this when starting fresh at L0 mid-game would feel
   * like a regression — e.g. pixelate L0 is a 4×4 grid that's only meant as
   * the opening hint; introducing it cold at step 5 should already be L1.
   */
  lateIntroLevel?: number;
};

export const HINT_META: Record<HintKind, HintMeta> = {
  pixelate: {
    kind: "pixelate",
    isImage: true,
    maxLevel: 2,
    step0Eligible: true,
    inGeneralPool: true,
    // L0 (4×4 grid) is only meant as an opening hint; if pixelate is first
    // introduced mid-game, skip straight to L1.
    lateIntroLevel: 1,
  },
  blinds: {
    kind: "blinds",
    isImage: true,
    maxLevel: 1,
    exclusiveWith: "blinds-h",
    inGeneralPool: true,
  },
  "blinds-h": {
    kind: "blinds-h",
    isImage: true,
    maxLevel: 1,
    exclusiveWith: "blinds",
    inGeneralPool: true,
  },
  crop: {
    kind: "crop",
    isImage: true,
    maxLevel: 2,
    step0Eligible: true,
    inGeneralPool: true,
  },
  "shuffle-move": {
    kind: "shuffle-move",
    isImage: true,
    maxLevel: 2,
    step0Eligible: true,
    inGeneralPool: true,
  },
  posterize: {
    kind: "posterize",
    isImage: true,
    maxLevel: 1,
    step0Eligible: true,
    inGeneralPool: true,
  },
  "edge-detect": {
    kind: "edge-detect",
    isImage: true,
    maxLevel: 1,
    inGeneralPool: true,
  },
  length: {
    kind: "length",
    isImage: false,
    maxLevel: 1,
    inGeneralPool: true,
  },
  difficulty: {
    kind: "difficulty",
    isImage: false,
    maxLevel: 1,
    inGeneralPool: true,
  },
  bpm: {
    kind: "bpm",
    isImage: false,
    maxLevel: 2,
    // BPM range is a weak hint — underweight so it appears less often.
    weight: 0.35,
    inGeneralPool: true,
    gatedBy: (chart) => chart.bpm != null,
  },
  genre: {
    kind: "genre",
    isImage: false,
    maxLevel: 0,
    inGeneralPool: true,
  },
  "game-version": {
    kind: "game-version",
    isImage: false,
    maxLevel: 0,
    minStep: 3,
    inGeneralPool: true,
  },
  artist: {
    kind: "artist",
    isImage: false,
    maxLevel: 1,
    minStep: 2,
    inGeneralPool: true,
  },
  "note-designer": {
    kind: "note-designer",
    isImage: false,
    maxLevel: 0,
    // Niche flavour, only some players track designers — keep occasional.
    weight: 0.35,
    inGeneralPool: true,
    gatedBy: (chart) =>
      chart.noteDesigner != null &&
      (chart.difficulty === "master" || chart.difficulty === "remaster"),
  },
};

export const ALL_HINT_KINDS: HintKind[] = Object.keys(HINT_META) as HintKind[];

/** Image-rendered hint kinds — these have a corresponding /image route. */
export const IMAGE_KINDS: ReadonlySet<HintKind> = new Set(
  ALL_HINT_KINDS.filter((k) => HINT_META[k].isImage),
);

/** Kinds eligible to appear at step 0 (forced cover-art hint). */
export const STEP0_KINDS: HintKind[] = ALL_HINT_KINDS.filter(
  (k) => HINT_META[k].step0Eligible,
);
