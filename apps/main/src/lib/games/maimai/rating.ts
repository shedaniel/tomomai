import type { ChartRatingInput, RankingBucketSizes } from "../types";
import { comboStatusToCode, difficultyToCode } from "./codes";
import { Versions } from "./versions";

// CiRCLE changed two rules: AP and AP+ add one rating, and the previous version's charts count as new.
const CIRCLE = Versions.MAIMAI_DX_CIRCLE.id;
const UTAGE = difficultyToCode("utage");
const ALL_PERFECT = new Set([comboStatusToCode("ap"), comboStatusToCode("ap+")]);

export const MAIMAI_BUCKET_SIZES: RankingBucketSizes = { new: 15, old: 35 };

export function apBonusApplies(version: number): boolean {
  return version >= CIRCLE;
}

export function isMaimaiNewChart(addedVersion: number, currentVersion: number): boolean {
  return addedVersion >= (currentVersion >= CIRCLE ? currentVersion - 1 : currentVersion);
}

export function isMaimaiRatedChart(difficultyCode: number): boolean {
  return difficultyCode !== UTAGE;
}

function getRatingFactor(accuracy: number): number {
  if (accuracy >= 100.5) return 0.224;
  if (accuracy >= 100) return 0.216;
  if (accuracy >= 99.5) return 0.211;
  if (accuracy >= 99) return 0.208;
  if (accuracy >= 98) return 0.203;
  if (accuracy >= 97) return 0.2;
  if (accuracy >= 94) return 0.168;
  if (accuracy >= 90) return 0.152;
  if (accuracy >= 80) return 0.136;
  if (accuracy >= 75) return 0.12;
  if (accuracy >= 70) return 0.112;
  if (accuracy >= 60) return 0.096;
  if (accuracy >= 50) return 0.08;
  return 0.05;
}

export function maimaiChartRating({ scoreValue, levelPrecise, difficultyCode, comboStatus }: ChartRatingInput, version: number): number {
  if (!isMaimaiRatedChart(difficultyCode)) return 0;
  const accuracy = scoreValue / 10000;
  const bonus = apBonusApplies(version) && ALL_PERFECT.has(comboStatus) ? 1 : 0;
  return getRatingFactor(accuracy) * Math.min(accuracy, 100.5) * levelPrecise / 10 + bonus;
}

export function maimaiPlayerRating(ratings: readonly number[]): number {
  return ratings.reduce((sum, rating) => sum + rating, 0);
}
