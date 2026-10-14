import { keyOf } from "@/lib/games/codes";
import type { CanonicalGameId } from "@/lib/games/ids";
import { getGameChartType, getGameDifficulty } from "@/lib/games/presentation";
import type { DisplayScore } from "./types";

type SearchedScore = Pick<DisplayScore, "songName" | "artist" | "difficultyCode" | "typeCode" | "levelPrecise">;

/** Whether a score matches a lowercase query by title, artist, level, chart type, or difficulty name, short label or key. */
export function matchesScoreQuery(game: CanonicalGameId, score: SearchedScore, query: string): boolean {
  const difficulty = getGameDifficulty(game, score.difficultyCode);
  return [
    score.songName,
    score.artist,
    difficulty.label,
    difficulty.shortLabel,
    keyOf(game, "difficulty", score.difficultyCode),
    (score.levelPrecise / 10).toFixed(1),
    getGameChartType(game, score.typeCode).label,
  ].some(field => field.toLowerCase().includes(query));
}
