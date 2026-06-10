-- chart_percentile_bands now joins parent_song for the difficulty filter.
-- Drop the stale view; the daily percentile-bands cron recreates it from the
-- updated SQL (CREATE ... IF NOT EXISTS) on its next run.
DROP MATERIALIZED VIEW IF EXISTS chart_percentile_bands;
