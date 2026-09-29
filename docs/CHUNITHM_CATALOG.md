# CHUNITHM catalog

The initial provider is [otoge-db](https://github.com/zvuc/otoge-db). It collects
regular BASIC, ADVANCED, EXPERT, MASTER and ULTIMA charts into the common catalog
pipeline. Catalog requests select the game explicitly; the frontend game's
configuration does not select an ingestion provider. No CHUNITHM-NET session is
needed. Configuring this catalog does not enable CHUNITHM player fetching or the
public frontend.

## Fetch pipeline

Both games collect through one `collectCatalog(game, context)`. It takes the
game's source stages for the region, appends the shared Fill Missing stage with
the game's level policy, runs them, completes every chart and sorts the result
by title, artist, chart type and difficulty. CHUNITHM's stages are `OtogeDB`.
maimai's are its scraper, official songs, DxData, fallback, otoge-db and
after-fetch stages, or Lxns alone for CN.

Every source emits `PendingChart` records with numeric chart codes. Source
stages merge into the charts collected so far through `asCatalogFetcher`, with
one merge policy and one identity, `catalogChartKey`. Source attribution, stage
notices, title validation and final required-field checks belong to the shared
runner.

The CHUNITHM otoge-db source parses pending charts only. The shared Fill Missing
step applies CHUNITHM's `.5` plus-level rule before finalization.

## Code layout

The shared catalog ingestion lives under `apps/main/src/server/services/catalog/`:

- `ingestion/` owns collection (`collect.ts`: `collectCatalog` and source
  authentication), the stage runner (`runner.ts`), the merge policy and modes
  (`merge.ts`), display levels and the Fill Missing stage (`levels.ts`), the
  pending chart and cover-rule contracts (`types.ts`), the completed chart
  schema and its identity, parent and instance fields (`schema.ts`), admin
  upload parsing (`parse-upload.ts`), chart identity, completion and ordering
  (`normalize-charts.ts`) and parent identity matching. `lock.ts` holds the
  advisory lock that serializes every catalog write with publication, and
  `columns.ts` the instance columns an upsert replaces.
- `ingestion/persistence/` writes an uploaded slice. `analyze.ts` is the pure
  part: it matches the upload to the stored slice, merges each pair, describes
  the changes and plans deletions for the update mode. `parents.ts` finds and
  creates parents and keeps parent attributes on the preferred instance
  (`CANONICAL_REGION_PREFERENCE` in `lib/games/regions.ts`). `index.ts`
  (`persistCatalog`) runs both in one locked transaction and returns the
  statistics, changes, applied and skipped deletions, and the affected charts.
- `sources/otoge-db.ts` holds the otoge-db URLs and its date and constant parsing,
  shared by both games' otoge-db sources.
- `admin-game.ts` resolves the explicit game, region and version of an admin
  request and refuses a write for another site's game. Every admin route runs
  through `adminRoute` (`lib/api/admin-route.ts`), which checks the admin token
  and answers rejections and failures with the request id.
- `images.ts` hosts collected covers on R2 with the game's cover rules.
- `apply.ts` is what the admin routes run: `collectCatalogRegion` (source login
  and collection), `applyCatalogUpload` (persist, publish, revalidate and notify)
  and `updateCatalogRegion`, which `update_all` calls in process for each region
  to collect, host covers, validate against the upload contract and apply.
- `publication.ts` publishes game-scoped catalog objects. `revalidation.ts`
  then invalidates the game's cache tags and, on the game's own site, its song
  pages, and asks every deployment in `CATALOG_PEER_ORIGINS` to drop its tags
  through `POST /api/admin/catalog/revalidate`. `notifications.ts` formats the
  song data update embed.

Discord delivery is generic and lives in
`apps/main/src/server/services/discord/webhook.ts`. It posts embeds under the
game's bot identity after the response is sent, truncates long descriptions and
sends the stage, error and tour event notices.

Each game describes its catalog once, as the `catalog` field of its server
module (`server/services/games/<game>/index.ts`, typed `CatalogSource`): its
source stages per region (loaded lazily), level policy, cover rules, title
normalization, source login and, for maimai, the legacy upload decoder. The
implementations live in `apps/main/src/server/services/games/<game>/catalog/`:

- `maimai/catalog/` owns its stage list (`pipeline.ts`), the chart helper and
  level policy (`chart.ts`), the legacy upload decoder (`legacy-upload.ts`),
  genre normalization, cover rules (`images.ts`) and `sources/` implementations.
- `chunithm/catalog/` owns its cover rules (`images.ts`) and the otoge-db source
  under `sources/`, with source fixtures under `fixtures/` and its tests beside
  the source.

Admin routes authenticate and dispatch an explicit game into these shared
entrypoints. Both games run in the same order: source stages, Fill Missing,
required-field completion, sorting, persistence, publication, then cache
invalidation and notifications.

## Sources and versions

Versions observed in the saved fixtures (2026-09-26):

| Region | Dataset | Catalog version |
| --- | --- | --- |
| JP | `chunithm/data/music-ex.json` | Mate (9) |
| International | `chunithm/data/music-ex-intl.json` | X-VERSE-X (8) |

Both files come from `https://raw.githubusercontent.com/zvuc/otoge-db/main/`.
Cover images come from the same repository's `chunithm/jacket/<image>` path.
The shared image stage converts them to WebP and stores them at
`${NEXT_PUBLIC_R2_URL}/covers/chunithm/<source-basename>.webp`. The game directory
avoids collisions with maimai, and both regions reuse the same stored jacket.
Existing objects skip downloading, conversion and upload. Image failures abort
that region's workflow before database persistence; raw source URLs are not used
as a fallback.

This provider supports current snapshots only. The current version comes from
the CHUNITHM version table in `lib/games/chunithm/versions.ts`, including its
regional release dates and the shared 07:00 JST rollover. Historical-version requests fail before fetching.
Adding a release only requires updating the canonical version metadata; the
otoge-db source contains no per-release configuration. The source's per-song `version` is the original **Japanese** release, so it cannot be
used as the International catalog version. International already includes some
Japanese Mate songs released there during X-VERSE-X.

The International file contains unavailable records: entries with `intl: "0"`
are excluded. JP excludes `intl: "2"` (International-only). WORLD'S END entries
have `we_kanji` / `we_star` fields and are excluded, including variants that share
a title with a regular chart. The deleted-song archive is not imported.

## Normalization

- Display levels are kept separately from the optional `lev_*_i` chart constant.
  A known `14.2` becomes `levelPrecise: 142`. The shared Fill Missing stage
  estimates absent constants from the displayed lower bound: `14` → `140`,
  `14+` → `145` for CHUNITHM. Known source constants are not replaced. maimai's
  level policy keeps its `.6` / historical `.7` plus thresholds and mismatch
  correction. Completed
  catalog charts always have numeric precision; an unresolvable chart fails
  validation instead of being dropped.
- `addedVersion` uses the existing shared date-to-version helper and is required
  in completed charts.
  BASIC–MASTER use the regional song-added date. ULTIMA prefers the regional
  chart-update date and falls back to the regional song-added date when absent.
  Such fallbacks carry `metadata.addedVersionEstimated: true`, alongside the raw
  source dates. This fallback can place a later ULTIMA chart in an earlier release
  until a more precise regional update date becomes available.
- The local pre-NEW International release table contains aliases sharing one date.
  The shared date-to-version helper resolves ties using the recognized original
  JP version only among matching candidates. Unambiguous regional dates take
  precedence: a JP Mate song released internationally during X-VERSE-X remains
  version 8. Source version labels and aliases belong to the canonical CHUNITHM
  version metadata. Missing required dates fail the shared finalization step.
- `metadata.levelPreciseEstimated` distinguishes estimates from source constants;
  the raw source constant remains in `metadata.otogeDb.constant`. Estimates
  participate in rating calculations as in maimai, and catalog displays prefix
  them with `≈`. Subsequent estimates cannot overwrite a known constant for an
  unchanged display level; a later confirmed source constant replaces an estimate.
- The source ID, source URL, original version label, reading, source dates,
  original BPM text, chart link and CHUNITHM note counts are kept in
  `songs.metadata.otogeDb`. Air and flick counts are not coerced into maimai note
  types. Non-numeric BPM text remains in metadata without fabricating a numeric
  BPM. The public API never publishes this metadata. It exposes the two estimate
  flags and the note counts, which `readChunithmNoteCounts`
  (`lib/games/chunithm/note-counts.ts`) reads.
- The source maps typed upstream records into pending charts, following the
  maimai provider. Shared finalization validates required fields and numeric
  codes before persistence. Chart identity is still game/title/chart
  type/difficulty; the source ID is retained as provenance, not yet used to
  reconcile future song renames.

## Verification

Small unmodified excerpts of both public datasets are stored alongside provider
tests in `apps/main/src/server/services/games/chunithm/catalog/fixtures`. The snapshots were
read on 2026-09-26; source Git blob IDs were
`2dddbe4815bfc0abb22d485935fdb5bfd201602a` (JP) and
`e78d65e5ec93851a34d6f2fc5b239412e94af8b7` (International).

Full snapshots passed through the shared source and Fill Missing stages:
6,843 regular JP charts (2,261 known constants) and 6,363 International charts
(2,242 known constants), all with numeric `levelPrecise` and `addedVersion`. These are
source coverage observations, not minimum counts enforced against future
releases. Focused tests cover regional availability, required-field finalization, missing
metadata, numeric codes, fallback thresholds, ULTIMA, WORLD'S END exclusion,
HTTP failures, release rollover, shared stage order and attribution notices. No database ingestion is required to run them.

## Admin requests

Every admin request names its game. Requests that write the catalog (`upload`,
`update_all`, `db`, `import` and `catalog/publish`) must go to the game's own
site, the deployment whose `FRONTEND_GAME` is that game, because only that
deployment renders the game's pages and can refresh them. Any other deployment
answers `409` with `WRONG_SITE`. Every deployment serves every game's public
API, so the writing site then asks the deployments listed in
`CATALOG_PEER_ORIGINS` to drop their cached copies. Collection alone may run on
any deployment:

- `/api/admin/update?game=chunithm&region=jp` collects and returns the catalog.
- `/api/admin/update_all?game=chunithm&image_upload=true`, on the CHUNITHM site,
  runs catalog ingestion for the configured regions (International then JP by
  default). Add `region=jp` or `region=intl` to select one region explicitly.

Image processing is enabled by default. Do not pass `image_upload=false` when
publishing CHUNITHM: that bypasses cover hosting and can persist upstream URLs
that the frontend does not allow. To replace covers in an existing imported
catalog, rerun `region=jp` and `region=intl` with images enabled. International
alone may leave JP-preferred parent covers unchanged; each region's publication
rebuilds all of the game's catalog slices, so a JP update also republishes
International.

Existing admin authentication remains required. A game account token is not
required for this public provider. Ingestion and publication still need the
existing database/R2 configuration; these commands are not run by the tests.

For example, collecting on the maimai site:

```sh
curl --fail-with-body \
  -H 'Authorization: Bearer <ADMIN_UPDATE_TOKEN>' \
  'https://tomomai.lol/api/admin/update?game=chunithm&region=jp'
```

Replace the token placeholder locally. The collection request reads the public
source; `update_all` additionally writes the catalog and publishes its objects.
No maimai or CHUNITHM account-session token belongs in this request.

Both `levelPrecise` and `addedVersion` retain their required numeric database and
API contracts. The catalog provider needs no schema change or new migration.
