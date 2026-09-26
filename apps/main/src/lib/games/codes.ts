import { getAchievementRate } from "@/lib/difficulty";
import type { CanonicalGameId, GameCodeMaps } from "./types";

import { GAME_CODE_MAPS as codeMaps } from "@tomomai/utils/game-codes";
export { RANKING_BUCKET_CODES } from "@tomomai/utils/game-codes";

export const GAME_CODE_MAPS: Record<CanonicalGameId, GameCodeMaps> = codeMaps;
export const MAIMAI_TITLE_TYPE_CODES = codeMaps.maimai.titleType;

export function getGrade(game: CanonicalGameId, scoreValue: number): string {
  if (game === "maimai") return getAchievementRate(scoreValue);
  const thresholds: readonly [number, string][] = [
    [1009000, "sss+"], [1007500, "sss"], [1005000, "ss+"], [1000000, "ss"],
    [990000, "s+"], [975000, "s"], [950000, "aaa"], [925000, "aa"],
    [900000, "a"], [800000, "bbb"], [700000, "bb"], [600000, "b"], [500000, "c"],
  ];
  return thresholds.find(([threshold]) => scoreValue >= threshold)?.[1].toUpperCase() ?? "D";
}
