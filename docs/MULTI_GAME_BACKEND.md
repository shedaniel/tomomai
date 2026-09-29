# Multi-game backend cutover

The integration starts from the current parent-song catalog. Parent IDs and
instance IDs retain their existing format and meaning. Shared catalog and user
records carry canonical `maimai` or `chunithm` identity, with composite foreign
keys preventing links across games. `NEXT_PUBLIC_ENABLED_CHUNITHM_REGIONS` gates
CHUNITHM player features. Unset means International and JP, and an empty value
disables them while the catalog stays readable.

## Migration artifact

`apps/main/drizzle-pg/0018_sweet_firelord.sql` is the single new migration after
upstream `0017_windy_namorita`. Before generation, the migration directory was
restored to upstream/main `4390db9d8e7d1451cb1e94a43bcc42274214266c` following the
required notifications. No previous migration or snapshot was rewritten.

The new SQL customizes the generated diff to preserve data:

- Lock affected tables during the runner's transaction and reject duplicate
  identities or unexpected maimai enum mappings before conversion.
- Backfill `game = 'maimai'`, rename score/recent metrics in place, and convert
  compact chart/status/title codes using verified enum order.
- Keep every parent, song, snapshot and score ID; add matching-game foreign
  keys after their referenced composite unique constraints exist.
- Copy B50 ranks 0–14 into the new bucket and 15–49 into the old bucket with
  bucket-relative ranks. Assert row counts and exact mappings before dropping
  `snapshot_b50`.
- Remove temporary game defaults, so new writes must explicitly choose game.
- Drop both known public percentile materialized views (`chart_percentile_bands`
  and `chart_percentile_bands_all_regions`) before any referenced column changes.
  The existing authorized refresh job recreates the current view afterward.
  Cleanup uses restrictive drops, so unexpected dependent objects stop migration.

Generation and static artifact checks do not execute this migration. No
schema-application command was run. Repository instructions prohibit applying
migrations here, including against a disposable database.

## Deployment

1. Back up the database and prepare a coordinated write-maintenance window.
   The migration locks large score/link tables and rebuilds indexes; estimate
   duration and disk headroom against the real deployment dataset.
2. Have the authorized deployment mechanism apply **0018 in one transaction**
   after 0017. Any audit or backfill assertion failure must abort the cutover;
   resolve the data issue rather than disabling the assertion.
3. Deploy the matching app and first-party consumers. Publish the explicit
   per-game catalog before reopening traffic. Verify parent dictionaries,
   current/historical slices, maimai fetch, a profile image and last credit.
4. Run the existing authorized percentile refresh job. The view remains
   maimai-only; missing-view reads retain the existing empty-result fallback.
5. Purge stale game-free API/catalog redirects and payloads at the CDN boundary.
   On a deployment that sets `NEXT_PUBLIC_ENABLED_CHUNITHM_REGIONS` to an empty value,
   confirm CHUNITHM player requests return `GAME_NOT_ENABLED`.

The schema cutover removes legacy enum columns and B50 storage. Rolling back
application code alone is unsupported; restore the database and matching old
application together, or stay on the new application with CHUNITHM disabled.

## Persistence and current boundaries

Common score ingestion owns token/session isolation and atomic snapshot,
score, ranking, recent and event writes. A fetch result arriving after the
provider timeout cannot enter persistence. A persistence deadline failure
rolls back its transaction. Parent-name collisions are left unresolved instead
of assigning scores to an arbitrary chart.

Each game's rating math lives in `lib/games/<game>/rating.ts`. Shared code
reaches it through the definition's `rating` (bucket sizes, chart rating,
new-chart rule, rated difficulties and player rating), and
`lib/games/ranking.ts` holds the one ranking selector. Ingestion and the snapshot version copy
(`server/services/games/snapshot-copy.ts`, one transaction) both store scores
through `writeSnapshotScores` in `server/services/games/score-storage.ts`, which
also stores the rating selection in `snapshot_rankings` for games with the
`rankings` capability. Readers that must agree with the stored snapshot rating
(the API B50 scope, the Discord profile summary and rating history) read that
selection back and only recompute chart ratings.

Recents carry optional game-specific `details`, stored in the recent row's
metadata, without requiring maimai DX scores or map state. Albums are maimai
enrichment gated by the `albums` capability. The maimai score source's
`persistExtra` step writes them, together with the recent-detail downloads,
after the common transaction commits. These optional external
operations are best effort and are not covered by database rollback. Provider
requests already in flight may finish after a timeout, but cannot commit a late
snapshot; maimai progress updates only affect pending maimai sessions.

Plates, percentile/recommendation calculations, reserved accounts, existing
UI presentation, credit/daily-play images and render tokens remain explicitly
maimai-only. Profile settings remain global. Generic API/query/tRPC boundaries
carry game; enabling a second scraper remains separate work.

Focused mocked tests cover score normalization, parent ambiguity, generic
optional persistence, transaction failure, deadline rejection and late fetch
results. These checks do not establish execution time, locking behavior or
backfill correctness against a production database. Static migration checks
verify snapshot lineage, single-version journal advancement, generated
constraint coverage, dependency ordering and preservation of upstream files.

## Retrying a failed percentile dependency cutover

The first 0018 artifact removed only `chart_percentile_bands_all_regions`. A
deployment retaining `public.chart_percentile_bands` could fail with PostgreSQL
`0A000` when converting `parent_song.difficulty`. The corrected 0018 removes both
known view names before every column type conversion; no migration regeneration
or new version is needed. Upstream 0017 remains unchanged.

With the installed Drizzle PostgreSQL migrator, pending migration statements and
their journal inserts run inside one transaction. A failed statement rolls back
that transaction, so the failed 0018 should not be recorded as applied. Deploy
the corrected artifact and retry through the authorized migration mechanism
after the deployment operator confirms rollback and maintenance conditions.
If a different runner executed statements individually, verify its database
state before retrying. Do not mark the failed migration complete or manually
drop unrelated dependencies. These changes were tested statically, without
connecting to or applying SQL against any database.

Run the dependency-order regression without database configuration:

```sh
node --test apps/main/scripts/check-multi-game-migration.mjs
```
