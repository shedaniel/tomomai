// Defines the chart_percentile_bands_all_regions materialized view — not tracked by Drizzle.
// The percentile cron job creates the view and refreshes it daily.
// All reads go through raw SQL in src/server/queries/percentile.ts.

export const CHART_PERCENTILE_VIEW = "chart_percentile_bands_all_regions";

// Parent identity pools each player's best score across regions and versions.
// Creates the view on first run only; subsequent runs use REFRESH below.
export const CREATE_CHART_PERCENTILE_VIEW_SQL = `
CREATE MATERIALIZED VIEW IF NOT EXISTS chart_percentile_bands_all_regions AS
WITH latest_regional_ratings AS (
  SELECT DISTINCT ON ("userId", region)
    "userId",
    rating
  FROM user_snapshots
  ORDER BY "userId", region, "fetchedAt" DESC, id DESC
),
latest_ratings AS (
  SELECT "userId", MAX(rating) AS rating
  FROM latest_regional_ratings
  GROUP BY "userId"
),
best_scores AS (
  SELECT
    lr."userId",
    s."parentId" AS parent_id,
    lr.rating,
    MAX(sd.achievement) AS best_achievement
  FROM latest_ratings lr
  JOIN user_snapshots us  ON us."userId" = lr."userId"
  JOIN snapshot_scores ss ON ss."snapshotId" = us.id
  JOIN score_data sd      ON sd.id = ss."scoreId"
  JOIN songs s            ON s.id = sd."songId"
  JOIN parent_song p      ON p.id = s."parentId"
  WHERE p.difficulty IN ('expert', 'master', 'remaster')
  GROUP BY lr."userId", s."parentId", lr.rating
),
band_aggregates AS (
  SELECT
    parent_id,
    (FLOOR(rating / 125.0) * 125)::smallint              AS band_lo,
    COUNT(DISTINCT "userId")::integer                     AS player_count,
    ARRAY_AGG(best_achievement ORDER BY best_achievement) AS all_achievements
  FROM best_scores
  GROUP BY parent_id, (FLOOR(rating / 125.0) * 125)::smallint
  HAVING COUNT(DISTINCT "userId") >= 10
)
SELECT
  parent_id,
  band_lo,
  CASE
    WHEN array_length(all_achievements, 1) <= 100 THEN all_achievements
    ELSE (
      SELECT ARRAY_AGG(all_achievements[idx] ORDER BY idx)
      FROM GENERATE_SERIES(
        1,
        array_length(all_achievements, 1),
        GREATEST(1, array_length(all_achievements, 1) / 100)
      ) AS idx
    )
  END AS achievements,
  player_count
FROM band_aggregates
`;

// Unique index required for REFRESH CONCURRENTLY; created once then reused.
export const CREATE_CHART_PERCENTILE_INDEX_SQL = `
CREATE UNIQUE INDEX IF NOT EXISTS chart_percentile_bands_all_regions_pkey
  ON chart_percentile_bands_all_regions (parent_id, band_lo)
`;

// Row type returned by raw SQL queries against the view.
// Must extend Record<string, unknown> to satisfy the postgres.js Row constraint.
export type ChartPercentileBandRow = {
  parent_id: bigint;
  band_lo: number;
  achievements: number[];
  player_count: number;
  [key: string]: unknown;
};
