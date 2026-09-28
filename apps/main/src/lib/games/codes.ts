import { getAchievementRate } from "@/lib/games/maimai/grades";
import type { CanonicalGameId } from "./ids";

export { GAME_CODES, RANKING_BUCKETS, RANKING_BUCKET_CODE, codeOf, keyOf, type CodeKey } from "@tomomai/games/codes";

export function getGrade(game: CanonicalGameId, scoreValue: number): string {
  if (game === "maimai") return getAchievementRate(scoreValue);
  const thresholds: readonly [number, string][] = [
    [1009000, "sss+"], [1007500, "sss"], [1005000, "ss+"], [1000000, "ss"],
    [990000, "s+"], [975000, "s"], [950000, "aaa"], [925000, "aa"],
    [900000, "a"], [800000, "bbb"], [700000, "bb"], [600000, "b"], [500000, "c"],
  ];
  return thresholds.find(([threshold]) => scoreValue >= threshold)?.[1].toUpperCase() ?? "D";
}
