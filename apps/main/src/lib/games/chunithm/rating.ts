import { codeOf } from "../codes";
import type { ChartRatingInput, RankingBucketSizes } from "../types";

const WORLDS_END = codeOf("chunithm", "difficulty", "worlds-end");

export const CHUNITHM_BUCKET_SIZES: RankingBucketSizes = { new: 20, old: 30 };

function interpolate(score: number, lowScore: number, highScore: number, lowValue: number, highValue: number): number {
  return lowValue + Math.floor(((score - lowScore) * (highValue - lowValue)) / (highScore - lowScore));
}

export function isChunithmNewChart(addedVersion: number, currentVersion: number): boolean {
  return addedVersion === currentVersion;
}

export function isChunithmRatedChart(difficultyCode: number): boolean {
  return difficultyCode !== WORLDS_END;
}

export function chunithmChartRating({ scoreValue, levelPrecise, difficultyCode }: ChartRatingInput): number {
  if (!isChunithmRatedChart(difficultyCode)) return 0;
  const constant = levelPrecise * 10;
  let rating: number;

  if (scoreValue >= 1_009_000) rating = constant + 215;
  else if (scoreValue >= 1_007_500) rating = constant + 200 + Math.floor((scoreValue - 1_007_500) / 100);
  else if (scoreValue >= 1_005_000) rating = constant + 150 + Math.floor((scoreValue - 1_005_000) / 500) * 10;
  else if (scoreValue >= 1_000_000) rating = constant + 100 + Math.floor((scoreValue - 1_000_000) / 1_000) * 10;
  else if (scoreValue >= 975_000) rating = constant + Math.floor((scoreValue - 975_000) / 2_500) * 10;
  else if (scoreValue >= 925_000) rating = interpolate(scoreValue, 925_000, 975_000, constant - 300, constant);
  else if (scoreValue >= 900_000) rating = interpolate(scoreValue, 900_000, 925_000, constant - 500, constant - 300);
  else if (scoreValue >= 800_000) rating = interpolate(scoreValue, 800_000, 900_000, Math.floor((constant - 500) / 2), constant - 500);
  else if (scoreValue >= 500_000) rating = interpolate(scoreValue, 500_000, 800_000, 0, Math.floor((constant - 500) / 2));
  else rating = 0;

  return Math.max(0, rating);
}

export function chunithmPlayerRating(ratings: readonly number[]): number {
  const sum = ratings.reduce((total, rating) => total + rating, 0);
  return Math.floor(sum / (CHUNITHM_BUCKET_SIZES.new + CHUNITHM_BUCKET_SIZES.old));
}
