// Defines the chart_percentile_bands materialized view — not tracked by Drizzle.
// DDL is owned by the cron job (src/app/api/cron/percentile-bands/route.ts),
// which DROPs and re-CREATEs the view on each daily run.
// All reads go through raw SQL in src/server/queries/percentile.ts.

export const CHART_PERCENTILE_VIEW = "chart_percentile_bands";

// Creates the view on first run only; subsequent runs use REFRESH below.
export const CREATE_CHART_PERCENTILE_VIEW_SQL = `
CREATE MATERIALIZED VIEW IF NOT EXISTS chart_percentile_bands AS
WITH latest_ratings AS (
  SELECT DISTINCT ON ("userId")
    "userId",
    rating
  FROM user_snapshots
  WHERE region = 'intl'
  ORDER BY "userId", "fetchedAt" DESC
),
best_scores AS (
  SELECT
    lr."userId",
    sd."songId" AS song_id,
    lr.rating,
    MAX(sd.achievement) AS best_achievement
  FROM latest_ratings lr
  JOIN user_snapshots us  ON us."userId" = lr."userId" AND us.region = 'intl'
  JOIN snapshot_scores ss ON ss."snapshotId" = us.id
  JOIN score_data sd      ON sd.id = ss."scoreId"
  JOIN songs s            ON s.id = sd."songId"
  WHERE s.difficulty IN ('expert', 'master', 'remaster')
    AND s.region = 'intl'
  GROUP BY lr."userId", sd."songId", lr.rating
),
band_aggregates AS (
  SELECT
    song_id,
    (FLOOR(rating / 125.0) * 125)::smallint              AS band_lo,
    COUNT(DISTINCT "userId")::integer                     AS player_count,
    ARRAY_AGG(best_achievement ORDER BY best_achievement) AS all_achievements
  FROM best_scores
  GROUP BY song_id, (FLOOR(rating / 125.0) * 125)::smallint
  HAVING COUNT(DISTINCT "userId") >= 10
)
SELECT
  song_id,
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
CREATE UNIQUE INDEX IF NOT EXISTS chart_percentile_bands_pkey
  ON chart_percentile_bands (song_id, band_lo)
`;

// Row type returned by raw SQL queries against the view.
// Must extend Record<string, unknown> to satisfy the postgres.js Row constraint.
export type ChartPercentileBandRow = {
  song_id: bigint;
  band_lo: number;
  achievements: number[];
  player_count: number;
  [key: string]: unknown;
};
