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

Queries return canonical code rows. Snapshot reads select
`gameSnapshotColumns` in `server/queries/snapshots.ts`, the public header, and
keep the internal snapshot id inside the query module. `fetchSnapshotRankings`
reaches a stored selection through the owner and the public snapshot id. The
maimai string vocabulary (achievement, DX score, combo and sync keys,
difficulty and chart type names, and the defaults for missing header fields)
is produced only by `server/services/games/maimai/legacy-view.ts`, for the
snapshot export, render tokens and the db top-songs list. Its `fromMaimaiScore`
is the one reverse mapping, used when normalizing scraped scores.

Queries filter by game on root rows only: `user_snapshots`, `user_recent_songs`,
`user_albums`, `user_tokens` and `fetch_sessions`, plus the catalog listings
(`songs` or `parent_song`). A child row needs no game predicate, because its
composite foreign key already keeps it in its parent's game. That covers
`snapshot_scores` and `snapshot_rankings` reached through a snapshot, and
`songs` or `parent_song` joined from a user row or from each other.
`user_events` keeps its game predicate, since its index leads with game.
Catalog reference checks name the game on `score_data`, `user_recent_songs`
and `user_albums`, so each lookup can use the index that includes it. The
newest snapshot of a user in a region is read through
`latestSnapshot(game, userId, region, columns)` in
`server/queries/latest-snapshot.ts`, with `asOf` for the newest one at or
before a given time.

A score source returns its normalized result and an optional `enrich` step
(`server/services/games/types.ts`). Shared ingestion persists the result, marks
the session completed, and only then runs the enrichment and the public profile
revalidation, so their failures are logged and never fail a saved snapshot.
maimai enriches with recent play details (the `user_recent_songs_detailed`
table) and album photos, CHUNITHM with recent play details stored in the recent
row's `metadata`. Reading them back is each game server module's
`recentDetails`: the shared recents query hands it a page of stored plays and
returns its decoded `details`, so neither the query nor the payload carries
another game's columns. Albums are gated by the `albums` capability in the fetched
region, and a fetch asks for the user's album preference only where albums are
offered. Every fetch step runs through `createFetchRun` in
`server/services/games/fetch-run.ts`, which checks the abort signal around each
stage, logs its duration and records its progress state, so a timed-out fetch
stops at its next stage and cannot commit a late snapshot. A failed stage is
rethrown as a `FetchStageError` naming the stage, and the session runner in
`server/services/games/fetch-sessions.ts` logs it once and stores the original
message on the session. `snapshot-persistence.ts` saves the snapshot in one
transaction and returns the scores without an unambiguous catalog match, which
the runner stores on the completed session as a JSON object.

Every game boundary goes through `resolveGameContext` in
`lib/games/access.ts`. The game must offer the capability, and a given region
must be enabled for player requests or supported for catalog administration.
`regionCapabilityOverrides` withdraws a capability in one region, such as
maimai albums in China. A rejection is a `GameAdapterError`, and
`GAME_ERROR_STATUS` in `lib/games/errors.ts` gives each code its HTTP and tRPC
status: 400 for an unknown game or unsupported region, 422 for a disabled game
or a missing capability, and 409 for a catalog write sent to another game's
site (`WRONG_SITE`, admin routes only). The tRPC base procedure maps these
errors wherever a procedure throws them. Generic procedures take
`{ game, region }` through `gameProcedure` or `{ game }` through
`gameOnlyProcedure` (`server/routers/game-procedures.ts`).

REST routes under `/api/v1/games/{game}` declare their capability on the spec
with `defineGameRoute` (`lib/api/registry.ts`), which lists only the games that
offer it in the docs and the OpenAPI document. A keyed route is served by
`defineGameHandler` (`lib/api/protect.ts`), which authenticates and meters the
key first, so an anonymous request is always a 401. A public route is served by
`definePublicGameHandler` (`lib/api/route.ts`), which never loads the key and
rate limit stack. Both then parse the game (400 `UNKNOWN_GAME`), the path and the
query (400 `INVALID_PARAMETER`), resolve the game for the spec's capability in
the queried region, and answer a returned body as the spec's response with
`game` added. A public spec's `cacheSeconds` sets the CDN cache headers of its
successful answers.

Response schemas live in `lib/api/schemas/`. `common.ts` holds what every game
shares: integer code fields (`codeField` points at the public
`GET /api/v1/games/{game}/codes` dictionary, which serves `GAME_CODES`), the
canonical score fields and the stats shape (status counts keyed by code, only
for the status kinds the game records). `maimai.ts` and `chunithm.ts` hold each
game's `details` shapes and the builders that fill them, and `index.ts` joins
them into discriminated unions on `game` for song detail, snapshots and recent
plays. `GAME_API_DETAILS` requires a song and snapshot builder per game, so a
new game cannot ship without its details. Recent plays publish the `details`
the recents query already decoded, with the playlog schema each game declares
in `lib/games/<game>/recent-details.ts`. Catalog responses publish `levelPreciseEstimated` and
`addedVersionEstimated` through `chartEstimates` (`lib/catalog/chart-metadata.ts`),
never the raw `songs.metadata`. The pre-namespace paths (`/api/v1/songs`,
`/api/v1/recents` and the others) are answered by `app/api/v1/[...legacy]` with
a JSON 410 `MOVED` pointing at the maimai path. A spec's `errors` lists its
route-specific refusal codes for the reference page and the OpenAPI document.

A fetch refused before its session starts throws a `FetchStartError`
(`server/services/games/fetch-errors.ts`) whose message is `CODE: detail`.
`FETCH_START_ERROR_STATUS` in `lib/games/fetch-error-codes.ts` gives each code
its HTTP and tRPC status: 412 for a missing, unreadable or single-use token and
a missing album preference, 409 while another fetch runs, 429 when rate limited
and 503 during maintenance. `fetchStartRejection` answers the REST route, the
bookmarklet login and the CN proxy callback from that table, with `Retry-After`
for maintenance and rate limits. The tRPC `startFetch` procedure maps the same
table and logs these refusals at warn. Clients read the code back with
`parseFetchErrorCode`, which also recognizes `SUBSCRIPTION_REQUIRED` on a
failed session. Login failures inside a running fetch are stored uncoded, and
`lib/token-errors.ts` recognizes them by message.

Plates, percentile calculations, daily plays, catalog
statistics, the snapshot JSON export and version copy, the CN score providers,
reserved accounts, existing UI presentation, credit/daily-play images and
render tokens remain explicitly maimai-only. Their tRPC procedures live under
`trpc.maimai` (`server/routers/maimai`). They take no game input and check
their own capability through `maimaiProcedure` or `maimaiRegionProcedure`.
Profile settings remain global. Generic API/query/tRPC boundaries carry game,
and enabling a second scraper remains separate work.

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
