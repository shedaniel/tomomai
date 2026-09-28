// Shared percentile types used by the UI and tRPC layer.
// Server-side internals (raw view rows, batch-query inputs) live in
// src/server/queries/percentile.ts.

/** A sampled score with a weight representing players in its rating band. */
export interface PercentileBucket {
  /** Achievement ×10000. */
  lo: number;
  count: number;
}

/** Per-chart percentile data as returned by the tRPC endpoint. */
export interface PercentileEntry {
  /** Estimated fraction strictly below this score; null when the peer pool is insufficient. */
  percentile: number | null;
  userRating: number;
  /** merged distinct player count used for this calculation */
  peerCount: number;
  /** pre-binned score distribution for the hover-card chart */
  distribution: PercentileBucket[];
  ratingDistribution: RatingScoreBucket[];
  totalPlayerCount: number;
  peerRatingRange: { min: number; max: number } | null;
}

/** Keyed by public song id. */
export type PercentileMap = Record<string, PercentileEntry>;

/** Shape consumed by the `PercentileDistribution` UI component. */
export interface PercentileDistributionData extends PercentileEntry {
  /** the viewer's own achievement on this chart (×10000) */
  userAchievement: number;
}

/** Anonymous clusters; ratings are only available in 125-point bands. */
export interface RatingScoreBucket {
  ratingLo: number;
  /** Lower bound of a 0.1 percentage-point achievement bin, ×10000. */
  achievementLo: number;
  /** Sample count, not the full population count. */
  count: number;
}
