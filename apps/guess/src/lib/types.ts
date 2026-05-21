// Mirror of `songCatalogueEntry` from apps/main/src/lib/api/schemas.ts.
// We avoid taking a workspace dep on the main app — duplicating this tiny type
// is much cheaper than coupling deployment graphs.
export type Region = "intl" | "jp" | "cn";
export type Difficulty =
  | "basic"
  | "advanced"
  | "expert"
  | "master"
  | "remaster"
  | "utage";
export type ChartType = "std" | "dx" | "utage";

export type Chart = {
  songId: string;
  songName: string;
  artist: string;
  cover: string | null;
  type: ChartType;
  genre: string;
  difficulty: Difficulty;
  level: string;
  levelPrecise: number;
  region: Region;
  gameVersion: number;
  addedVersion: number;
  bpm: number | null;
  noteDesigner: string | null;
};

// ---------- Hint plan -----------------------------------------------------

export type HintKind =
  | "pixelate"
  | "blinds"
  | "blinds-h"
  | "crop"
  | "shuffle-move"
  | "posterize"
  | "edge-detect"
  | "length"
  | "difficulty"
  | "bpm"
  | "genre"
  | "game-version"
  | "artist"
  | "note-designer";

export type Hint =
  | { kind: "pixelate"; level: 0 | 1 | 2 }
  | { kind: "blinds"; level: 0 | 1 }
  | { kind: "blinds-h"; level: 0 | 1 }
  | { kind: "crop"; level: 0 | 1 | 2 }
  | { kind: "shuffle-move"; level: 0 | 1 | 2 }
  | { kind: "posterize"; level: 0 | 1 }
  | { kind: "edge-detect"; level: 0 | 1 }
  | { kind: "length"; level: 0 | 1 }
  | { kind: "difficulty"; level: 0 | 1 }
  | { kind: "bpm"; level: 0 | 1 | 2 }
  | { kind: "genre"; level: 0 }
  | { kind: "game-version"; level: 0 }
  | { kind: "artist"; level: 0 | 1 }
  | { kind: "note-designer"; level: 0 };

export type Reveal = {
  songId: string;
  songName: string;
  artist: string;
  cover: string | null;
  difficulty: Difficulty;
  level: string;
  levelPrecise: number;
  type: ChartType;
};

/**
 * Number of hints before the reveal. Env-driven so the puzzle length is easy
 * to tweak without redeploying app code. The full deck size is HINT_COUNT + 1
 * (the +1 is the reveal card).
 */
export const HINT_COUNT: number = (() => {
  const raw = process.env.GUESS_HINT_COUNT;
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n >= 2 ? n : 6;
})();

export const TOTAL_STEPS: number = HINT_COUNT + 1; // last step = reveal
