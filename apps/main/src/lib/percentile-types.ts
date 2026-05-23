// Shared percentile types used by the UI and tRPC layer.
// Server-side internals (raw view rows, batch-query inputs) live in
// src/server/queries/percentile.ts.

/** A single bin in the chart's pre-binned score distribution. */
export interface PercentileBucket {
  /** lower bound of bucket (achievement ×10000) */
  lo: number;
  count: number;
}

/** Per-chart percentile data as returned by the tRPC endpoint. */
export interface PercentileEntry {
  /** 0.0–1.0; 0.0 = lowest scorer, 1.0 = highest scorer among peers */
  percentile: number;
  /** merged distinct player count used for this calculation */
  peerCount: number;
  /** pre-binned score distribution for the hover-card chart */
  distribution: PercentileBucket[];
}

/** Keyed by public song id. */
export type PercentileMap = Record<string, PercentileEntry>;

/** Shape consumed by the `PercentileDistribution` UI component. */
export interface PercentileDistributionData extends PercentileEntry {
  /** the viewer's own achievement on this chart (×10000) */
  userAchievement: number;
}
