import { codeToChartType, codeToComboStatus, codeToSyncStatus } from "@/lib/games/maimai/codes";
import { formatGameScore, getGrade } from "@/lib/games/presentation";
import { netDifficulty, type NetDifficulty } from "./difficulty";

/** The chart and score fields /net cards read, a subset of GamePlayerScore and recent plays. */
export type NetChartScore = {
  songName: string;
  cover?: string | null;
  level: string;
  difficultyCode: number;
  typeCode: number;
  scoreValue?: number | null;
  secondaryScore?: number | null;
  comboStatus?: number | null;
  syncStatus?: number | null;
};

export type NetScoreView = {
  difficulty: NetDifficulty;
  chartType: "std" | "dx";
  achievement: string | null;
  grade: string | null;
  dxScore: number | null;
  combo: string | null;
  sync: string | null;
};

function safe<T>(read: () => T): T | null {
  try {
    return read();
  } catch {
    return null;
  }
}

export function netScoreView(score: NetChartScore): NetScoreView {
  const played = score.scoreValue != null;
  return {
    difficulty: netDifficulty(score.difficultyCode),
    chartType: safe(() => codeToChartType(score.typeCode)) ?? "std",
    achievement: played ? formatGameScore("maimai", score.scoreValue) : null,
    grade: played ? getGrade("maimai", score.scoreValue!) : null,
    dxScore: score.secondaryScore ?? null,
    combo: score.comboStatus != null ? safe(() => codeToComboStatus(score.comboStatus!)) : null,
    sync: score.syncStatus != null ? safe(() => codeToSyncStatus(score.syncStatus!)) : null,
  };
}

/** "100.4999%" split into the big integer part and the small decimals, as the result screen prints it. */
export function splitAchievement(text: string): [string, string] {
  const dot = text.indexOf(".");
  return dot === -1 ? [text, ""] : [text.slice(0, dot + 1), text.slice(dot + 1)];
}
