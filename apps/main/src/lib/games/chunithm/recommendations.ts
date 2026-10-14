import { codeOf } from "../codes";
import type { RecommendationTarget } from "../types";
import { CHUNITHM_GRADES } from "./grades";

const LOWEST_TARGET_SCORE = 900_000;

export const CHUNITHM_RECOMMENDATION_TARGETS: readonly RecommendationTarget[] = CHUNITHM_GRADES
  .filter(grade => grade.min >= LOWEST_TARGET_SCORE)
  .map((grade): RecommendationTarget => ({
    kind: "score",
    label: grade.label,
    scoreValue: grade.min,
    comboStatus: codeOf("chunithm", "comboStatus", "none"),
  }))
  .reverse();
