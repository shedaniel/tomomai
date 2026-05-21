import type { Chart, HintKind } from "./types";
import { HINT_META, type HintMeta } from "./hints-meta";
import {
  blinds,
  blindsHorizontal,
  crop,
  edgeDetect,
  pixelate,
  posterize,
  shuffleMove,
} from "./image";
import { getVersionName } from "./versions";
import { Rng } from "./rng";

/**
 * Server-only hint registry. Each entry combines the client-safe metadata
 * from `hints-meta.ts` with per-kind transforms (image hints) and describers
 * (text hints). This file pulls in `sharp` + `node:crypto` via its imports
 * and must never be imported from a client component.
 *
 * To add a new hint kind:
 *   1. Extend `HintKind` / `Hint` in types.ts.
 *   2. Add an entry in `hints-meta.ts`.
 *   3. Add an entry here (transform OR describe).
 *   4. Add `guess.hints.<kind>` i18n keys.
 *   5. If it's a text kind, add a render branch in HintCard.tsx.
 */
type ImageTransform = (coverUrl: string, level: number, seed: string) => Promise<Buffer>;

type Describer = (
  level: number,
  chart: Chart,
  dateKey: string,
) => Record<string, unknown>;

export type HintEntry = HintMeta & {
  transform?: ImageTransform;
  describe?: Describer;
};

// ---------- per-kind text describers --------------------------------------

function pickIndex(seed: string, len: number, dateKey: string): number {
  if (len <= 0) return 0;
  return new Rng(`${dateKey}:${seed}`).intBelow(len);
}

function nonWhitespaceIndices(codepoints: readonly string[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < codepoints.length; i++) {
    if (!/\s/.test(codepoints[i]!)) out.push(i);
  }
  return out;
}

const describeLength: Describer = (level, chart, dateKey) => {
  const codepoints = [...chart.songName];
  const len = codepoints.length;
  if (level === 0) {
    const offsets: ReadonlyArray<readonly [number, number]> = [
      [-2, 0],
      [-1, 1],
      [0, 2],
    ];
    const choice = pickIndex("lengthwin", offsets.length, dateKey);
    const [lo, hi] = offsets[choice]!;
    return { min: Math.max(1, len + lo), max: len + hi };
  }
  const pool = nonWhitespaceIndices(codepoints);
  const fallbackPool = pool.length > 0 ? pool : codepoints.map((_, i) => i);
  const idx = fallbackPool[pickIndex("lengthchar", fallbackPool.length, dateKey)]!;
  const obfuscated = codepoints
    .map((ch, i) => (i === idx ? ch : /\s/.test(ch) ? "　" : "・"))
    .join("");
  return { exact: len, char: codepoints[idx], obfuscated };
};

const describeDifficulty: Describer = (level, chart) => {
  if (level === 0) return { difficulty: chart.difficulty, displayLevel: chart.level };
  return {
    difficulty: chart.difficulty,
    displayLevel: chart.level,
    levelPrecise: chart.levelPrecise,
  };
};

const describeBpm: Describer = (level, chart, dateKey) => {
  const bpm = chart.bpm!;
  if (level === 2) return { exact: bpm };
  const width = level === 0 ? 60 : 20;
  const placements: ReadonlyArray<readonly [number, number]> = [
    [-width, 0],
    [-width / 2, width / 2],
    [0, width],
  ];
  const choice = pickIndex(`bpmwin:${level}`, placements.length, dateKey);
  const [lo, hi] = placements[choice]!;
  return {
    range: [Math.max(1, Math.round(bpm + lo)), Math.round(bpm + hi)] as [number, number],
  };
};

const describeGenre: Describer = (_l, chart) => ({ genre: chart.genre });

const describeGameVersion: Describer = (_l, chart) => ({
  versionName: getVersionName(chart.addedVersion),
});

const describeArtist: Describer = (level, chart, dateKey) => {
  if (level === 1) return { artist: chart.artist };
  const codepoints = [...chart.artist];
  const len = codepoints.length;
  if (len <= 2) return { obfuscated: chart.artist, revealed: len };
  const pool = nonWhitespaceIndices(codepoints);
  const fallbackPool = pool.length > 0 ? pool : codepoints.map((_, i) => i);
  const a = fallbackPool[pickIndex("artistchar:a", fallbackPool.length, dateKey)]!;
  const remaining = fallbackPool.filter((i) => i !== a);
  const b =
    remaining.length > 0
      ? remaining[pickIndex("artistchar:b", remaining.length, dateKey)]!
      : a;
  const out = codepoints.map((ch, i) => {
    if (i === a || i === b) return ch;
    if (/\s/.test(ch)) return "　";
    return "・";
  });
  return { obfuscated: out.join(""), revealed: 2 };
};

const describeNoteDesigner: Describer = (_l, chart) => ({
  designer: chart.noteDesigner ?? "",
});

// ---------- registry ------------------------------------------------------

const BEHAVIOURS: Partial<Record<HintKind, Pick<HintEntry, "transform" | "describe">>> = {
  pixelate: { transform: (url, level) => pixelate(url, level) },
  blinds: { transform: (url, level) => blinds(url, level) },
  "blinds-h": { transform: (url, level) => blindsHorizontal(url, level) },
  crop: { transform: (url, level, seed) => crop(url, level, seed) },
  "shuffle-move": { transform: (url, level, seed) => shuffleMove(url, level, seed) },
  posterize: { transform: (url, level) => posterize(url, level) },
  "edge-detect": { transform: (url, level) => edgeDetect(url, level) },
  length: { describe: describeLength },
  difficulty: { describe: describeDifficulty },
  bpm: { describe: describeBpm },
  genre: { describe: describeGenre },
  "game-version": { describe: describeGameVersion },
  artist: { describe: describeArtist },
  "note-designer": { describe: describeNoteDesigner },
};

export const HINTS: Record<HintKind, HintEntry> = Object.fromEntries(
  (Object.keys(HINT_META) as HintKind[]).map((k) => [
    k,
    { ...HINT_META[k], ...(BEHAVIOURS[k] ?? {}) } as HintEntry,
  ]),
) as Record<HintKind, HintEntry>;
