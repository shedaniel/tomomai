import type { RecommendationTarget } from "../types";
import { comboStatusToCode } from "./codes";
import { MAIMAI_GRADES } from "./grades";
import { maimaiRatingBonuses } from "./rating";

const LOWEST_TARGET_SCORE = 940_000;
const COMBO_EFFICIENCY = 2;

/** The targets reached by score alone, which percentile peers are measured against. */
export const MAIMAI_SCORE_TARGETS: readonly RecommendationTarget[] = MAIMAI_GRADES
  .filter(grade => grade.min >= LOWEST_TARGET_SCORE)
  .map((grade): RecommendationTarget => ({
    kind: "score",
    label: grade.label,
    scoreValue: grade.min,
    comboStatus: comboStatusToCode("none"),
  }))
  .reverse();

export function maimaiRecommendationTargets(version: number): readonly RecommendationTarget[] {
  return [
    ...MAIMAI_SCORE_TARGETS,
    ...maimaiRatingBonuses(version).map((bonus): RecommendationTarget => ({
      kind: "combo",
      label: bonus.label,
      scoreValue: bonus.scoreValue,
      comboStatus: bonus.comboStatuses[0],
      efficiency: COMBO_EFFICIENCY,
    })),
  ];
}
