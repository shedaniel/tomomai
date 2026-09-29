import { codeToComboStatus, codeToDifficulty } from "@/lib/games/maimai/codes";
import { calculateSongRating } from "@/lib/rating-calculator";
import type { RankedScore, RankingBucketSizes, RankingSelection } from "./types";

function interpolate(score: number, lowScore: number, highScore: number, lowValue: number, highValue: number): number {
  return lowValue + Math.floor(((score - lowScore) * (highValue - lowValue)) / (highScore - lowScore));
}

export function calculateChunithmChartRating(scoreValue: number, levelPrecise: number): number {
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

export function calculateMaimaiChartRating(
  scoreValue: number,
  levelPrecise: number,
  difficulty: number,
  comboStatus: number,
  version: number,
): number {
  return calculateSongRating({
    difficulty: codeToDifficulty(difficulty),
    achievement: scoreValue,
    fc: codeToComboStatus(comboStatus),
    levelPrecise,
  }, version);
}

export function rankIntoBuckets<T extends RankedScore>(
  scores: T[],
  isNew: (score: T) => boolean,
  bucketSizes: RankingBucketSizes,
): RankingSelection<T> {
  const sorted = [...scores]
    .sort((a, b) => b.rating - a.rating || b.scoreValue - a.scoreValue)
    .map(score => ({ ...score, rating: Math.floor(score.rating) }));
  const newScores = sorted.filter(isNew);
  const oldScores = sorted.filter(score => !isNew(score));
  return {
    newScores: newScores.slice(0, bucketSizes.new),
    oldScores: oldScores.slice(0, bucketSizes.old),
    newRemaining: newScores.slice(bucketSizes.new),
    oldRemaining: oldScores.slice(bucketSizes.old),
  };
}
