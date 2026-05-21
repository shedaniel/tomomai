// Client-facing shapes of the /api responses. Mirrors describeHint() output
// in lib/today.ts.
import type { Difficulty, ChartType } from "./types";

export type HintPayload =
  | { kind: "pixelate"; level: number }
  | { kind: "blinds"; level: number }
  | { kind: "blinds-h"; level: number }
  | { kind: "crop"; level: number }
  | { kind: "shuffle-move"; level: number }
  | { kind: "posterize"; level: number }
  | { kind: "edge-detect"; level: number }
  | {
      kind: "length";
      level: number;
      min?: number;
      max?: number;
      exact?: number;
      char?: string;
      obfuscated?: string;
    }
  | {
      kind: "difficulty";
      level: number;
      difficulty: Difficulty;
      displayLevel?: string;
      levelPrecise?: number;
    }
  | { kind: "bpm"; level: number; range?: [number, number]; exact?: number }
  | { kind: "genre"; level: 0; genre: string }
  | { kind: "game-version"; level: 0; versionName: string }
  | {
      kind: "artist";
      level: number;
      artist?: string;
      obfuscated?: string;
      revealed?: number;
    }
  | { kind: "note-designer"; level: 0; designer: string };

export type RevealPayload = {
  songId: string;
  songName: string;
  artist: string;
  cover: string | null;
  difficulty: Difficulty;
  level: string;
  levelPrecise: number;
  type: ChartType;
};

export type StepResponse =
  | { step: number; dateKey: string; hint: HintPayload }
  | { step: number; dateKey: string; reveal: RevealPayload };

export type SongSummary = { songId: string; songName: string; artist: string };
