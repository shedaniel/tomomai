import { getGame } from "./registry";
import type { CanonicalGameId } from "./ids";

export type RatingBucketKey = "new" | "old";

/** A player's rating selection: the integer chart ratings counted in each bucket, best first. */
export type RatingStanding = {
  gameVersion: number;
  /** The player rating the snapshot was fetched with. */
  playerRating: number;
  new: number[];
  old: number[];
  /** Where each of one song's charts sits in the selection, by difficulty key. */
  charts: Record<string, { bucket: RatingBucketKey; index: number }>;
};

export function ratingBucketOf(game: CanonicalGameId, addedVersion: number, gameVersion: number): RatingBucketKey {
  return getGame(game).rating.isNew(addedVersion, gameVersion) ? "new" : "old";
}

/** The lowest chart rating a chart must beat to enter a full bucket, or null while the bucket has room. */
export function ratingBucketFloor(game: CanonicalGameId, standing: RatingStanding, bucket: RatingBucketKey): number | null {
  const ratings = standing[bucket];
  return ratings.length < getGame(game).rating.bucketSizes[bucket] ? null : ratings[ratings.length - 1] ?? null;
}

/**
 * How much the player rating rises when a chart reaches `targetRating`. A chart already in the selection is
 * raised in place; any other chart takes the place of the bucket's lowest chart, or joins a bucket with room.
 */
export function playerRatingGain(
  game: CanonicalGameId,
  standing: RatingStanding,
  chart: { bucket: RatingBucketKey; index: number | null },
  targetRating: number,
): number {
  const { rating } = getGame(game);
  const target = Math.floor(targetRating);
  const ratings = [...standing[chart.bucket]];
  if (chart.index !== null) {
    if (target <= ratings[chart.index]) return 0;
    ratings[chart.index] = target;
  } else if (ratings.length < rating.bucketSizes[chart.bucket]) {
    ratings.push(target);
  } else {
    if (target <= ratings[ratings.length - 1]) return 0;
    ratings[ratings.length - 1] = target;
  }
  const next = chart.bucket === "new" ? [...ratings, ...standing.old] : [...standing.new, ...ratings];
  return Math.max(0, rating.playerRating(next) - rating.playerRating([...standing.new, ...standing.old]));
}
