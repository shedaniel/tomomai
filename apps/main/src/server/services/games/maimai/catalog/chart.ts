import { chartTypeToCode, difficultyToCode } from "@/lib/games/maimai/codes";
import type { Difficulty, SongType } from "@/lib/games/maimai/types";
import { parseDisplayLevel, type CatalogLevelPolicy } from "@/server/services/catalog/ingestion/levels";
import type { SourceChart } from "@/server/services/catalog/ingestion/types";

export const MAIMAI_UTAGE = difficultyToCode("utage");

type MaimaiChartFields = Omit<SourceChart, "game" | "chartType" | "difficulty"> & { type: SongType; difficulty: Difficulty };

/** A maimai source chart from the chart type and difficulty names its sources use. */
export function maimaiChart({ type, difficulty, ...fields }: MaimaiChartFields): SourceChart {
  return { ...fields, game: "maimai", chartType: chartTypeToCode(type), difficulty: difficultyToCode(difficulty) };
}

export function maimaiLevelPolicy(version: number): CatalogLevelPolicy {
  return {
    // BUDDiES PLUS (version 9) moved the start of a `+` level from .7 to .6.
    toPrecise: level => parseDisplayLevel(level, version >= 9 ? 6 : 7),
    mismatchUpperOffset: minimum => minimum < 70 ? 9 : 5,
  };
}
