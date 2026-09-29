import { getGame } from "./registry";
import type { CanonicalGameId, ChartRatingInput, GameRating, RankedScore, RankingSelection } from "./types";

/** `chartRating` is a rating computed before the score's details were redacted. */
type RatableScore = ChartRatingInput & { chartRating?: number };

type Rated<T> = T & { rating: number };

export function rateScores<T extends RatableScore>(game: CanonicalGameId, scores: readonly T[], version: number): Rated<T>[] {
  const { rating } = getGame(game);
  return scores.map(score => ({ ...score, rating: score.chartRating ?? rating.chartRating(score, version) }));
}

/** Orders by precise rating, then score, and keeps the integer rating each chart counts for. */
export function sortByRating<T extends { scoreValue: number; rating: number }>(scores: readonly T[]): T[] {
  return [...scores]
    .sort((a, b) => b.rating - a.rating || b.scoreValue - a.scoreValue)
    .map(score => ({ ...score, rating: Math.floor(score.rating) }));
}

export function selectRankings<T extends RankedScore>(
  scores: readonly T[],
  currentVersion: number,
  { bucketSizes, isNew }: Pick<GameRating, "bucketSizes" | "isNew">,
): RankingSelection<T> {
  const sorted = sortByRating(scores);
  const newScores = sorted.filter(score => isNew(score.addedVersion, currentVersion));
  const oldScores = sorted.filter(score => !isNew(score.addedVersion, currentVersion));
  return {
    newScores: newScores.slice(0, bucketSizes.new),
    oldScores: oldScores.slice(0, bucketSizes.old),
    newRemaining: newScores.slice(bucketSizes.new),
    oldRemaining: oldScores.slice(bucketSizes.old),
  };
}

export function rankScores<T extends RatableScore & { addedVersion: number }>(game: CanonicalGameId, scores: readonly T[], version: number) {
  const rated = rateScores(game, scores, version);
  return { rated, ...selectRankings(rated, version, getGame(game).rating) };
}

