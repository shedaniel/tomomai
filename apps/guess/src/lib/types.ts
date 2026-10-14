import type { CatalogSong } from "@tomomai/games/catalog-client";
import type { CodeKey } from "@tomomai/games/codes";

export type Difficulty = CodeKey<"maimai", "difficulty">;
export type ChartType = CodeKey<"maimai", "chartType">;

export type Chart = CatalogSong<"maimai">;

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
  | "note-designer"
  | "audio";

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
  | { kind: "note-designer"; level: 0 }
  | { kind: "audio"; level: 0 | 1 | 2 | 3 | 4 | 5 | 6 };

export type Reveal = {
  songId: string;
  songName: string;
  artist: string;
  cover: string | null;
  difficulty: Difficulty;
  level: string;
  levelPrecise: number;
  type: ChartType;
  /** Only populated in heardle mode — full 30s preview URL for the reveal card. */
  previewUrl?: string;
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
