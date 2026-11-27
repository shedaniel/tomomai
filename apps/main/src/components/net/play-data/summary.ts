import { codeOf } from "@/lib/games/codes";
import { MAIMAI_GRADES } from "@/lib/games/maimai/grades";
import type { StatsResult } from "@/server/queries/stats";
import { NET_DIFFICULTIES, type NetDifficulty } from "../difficulty";

/** Left column of the grid: each row counts that grade or better, like DX NET. */
export const PLAY_DATA_GRADE_ROWS = [
  { label: "SSS+", min: 1_005_000 },
  { label: "SSS", min: 1_000_000 },
  { label: "SS+", min: 995_000 },
  { label: "SS", min: 990_000 },
  { label: "S+", min: 980_000 },
  { label: "S", min: 970_000 },
  { label: "AAA", min: 940_000 },
  { label: "CLEAR", min: 800_000 },
] as const;

/** Right column: each row counts that status or better within its kind. */
export const PLAY_DATA_STATUS_ROWS = [
  { label: "AP+", kind: "comboStatus", keys: ["ap+"] },
  { label: "AP", kind: "comboStatus", keys: ["ap+", "ap"] },
  { label: "FC+", kind: "comboStatus", keys: ["ap+", "ap", "fc+"] },
  { label: "FC", kind: "comboStatus", keys: ["ap+", "ap", "fc+", "fc"] },
  { label: "FDX+", kind: "syncStatus", keys: ["fdx+"] },
  { label: "FDX", kind: "syncStatus", keys: ["fdx+", "fdx"] },
  { label: "FS+", kind: "syncStatus", keys: ["fdx+", "fdx", "fs+"] },
  { label: "FS", kind: "syncStatus", keys: ["fdx+", "fdx", "fs+", "fs"] },
] as const;

export type PlayDataBucket = { total: number; grades: number[]; statuses: number[] };
export type PlayDataFilter = NetDifficulty | "all";
export type PlayDataSummary = Record<PlayDataFilter, PlayDataBucket>;

/** DX NET's ALL leaves U-TA-GE out. */
export const PLAY_DATA_DIFFICULTIES = NET_DIFFICULTIES.filter(difficulty => difficulty !== "utage");

function emptyBucket(): PlayDataBucket {
  return { total: 0, grades: PLAY_DATA_GRADE_ROWS.map(() => 0), statuses: PLAY_DATA_STATUS_ROWS.map(() => 0) };
}

/** Sums the per-version stats into one bucket per difficulty, plus ALL. */
export function summarizePlayData({ stats, totalSongs }: StatsResult): PlayDataSummary {
  const summary = Object.fromEntries(["all", ...NET_DIFFICULTIES].map(key => [key, emptyBucket()])) as PlayDataSummary;
  const add = (difficulty: NetDifficulty, apply: (bucket: PlayDataBucket) => void) => {
    apply(summary[difficulty]);
    if (difficulty !== "utage") apply(summary.all);
  };

  for (const byDifficulty of Object.values(totalSongs)) {
    for (const [code, count] of Object.entries(byDifficulty)) {
      const difficulty = NET_DIFFICULTIES[Number(code)];
      if (difficulty) add(difficulty, bucket => { bucket.total += count; });
    }
  }

  for (const byDifficulty of Object.values(stats)) {
    for (const [code, stat] of Object.entries(byDifficulty)) {
      const difficulty = NET_DIFFICULTIES[Number(code)];
      if (!difficulty) continue;
      const grades = PLAY_DATA_GRADE_ROWS.map(row => MAIMAI_GRADES
        .filter(grade => grade.min >= row.min)
        .reduce((sum, grade) => sum + (stat.grades[grade.label] ?? 0), 0));
      const statuses = PLAY_DATA_STATUS_ROWS.map(row => row.keys
        .reduce((sum, key) => sum + (stat.statuses[row.kind]?.[codeOf("maimai", row.kind, key)] ?? 0), 0));
      add(difficulty, bucket => {
        grades.forEach((count, index) => { bucket.grades[index] += count; });
        statuses.forEach((count, index) => { bucket.statuses[index] += count; });
      });
    }
  }

  return summary;
}
