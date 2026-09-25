# CHUNITHM catalog

The initial provider is [otoge-db](https://github.com/zvuc/otoge-db). It collects
regular BASIC, ADVANCED, EXPERT, MASTER and ULTIMA charts into the common catalog
pipeline. Catalog requests select the game explicitly; the frontend game's
configuration does not select an ingestion provider. No CHUNITHM-NET session is
needed. Configuring this catalog does not enable CHUNITHM player fetching or the
public frontend.

## Fetch pipeline

Both games use the same step runner extracted from the existing maimai level
fetcher. CHUNITHM configures `OtogeDB → Fill Missing → Sorter`; the maimai
provider list and ordering stay intact. Source steps merge through the same
fetcher adapter and force-mode handling, and every step receives the same
previous/current step, index, logger and notice state. Source attribution,
stage summaries, validation and final required-field checks belong to that
shared runner.

The CHUNITHM otoge-db source parses pending charts only. The shared Fill Missing
step applies CHUNITHM's `.5` plus-level rule before the shared Sorter and
finalization. The adapter's advertised stages come from this executable list.

## Code layout

Catalog ingestion lives under `apps/main/src/server/services/catalog/`:

- `ingestion/` owns the canonical collection/persistence entrypoints, shared step
  runner, merge modes, Fill Missing and sorting stages, pending chart contracts,
  normalization and parent identity matching.
- `maimai/` owns its executable pipeline, legacy chart normalization, merge
  configuration, pending-song shape and `sources/` implementations.
- `chunithm/` owns its executable pipeline and otoge-db source under `sources/`,
  with source fixtures and tests beside that implementation.
- `images.ts` processes incoming covers; `image-cache.ts` caches stored catalog
  covers. Maimai URL/static-asset rules live in `maimai/images.ts`.
- `publication.ts` publishes game-scoped catalog objects; `notifications.ts`
  formats and delivers the existing ingestion notices.

Admin routes authenticate and dispatch an explicit game into these shared
entrypoints. Source acquisition, source authentication and game-specific rules
stay in their game directory. The registry binds these pipelines; it does not
introduce a separate collection loop. Both games retain the existing order:
source stages, Fill Missing, Sorter, required-field normalization, persistence,
publication, then cache invalidation and notifications. No migration or URL
changes are part of this layout refactor.

## Sources and versions

Versions observed in the saved fixtures (2026-09-26):

| Region | Dataset | Catalog version |
| --- | --- | --- |
| JP | `chunithm/data/music-ex.json` | Mate (9) |
| International | `chunithm/data/music-ex-intl.json` | X-VERSE-X (8) |

Both files come from `https://raw.githubusercontent.com/zvuc/otoge-db/main/`.
Cover images use the same repository's `chunithm/jacket/<image>` path.

This provider supports current snapshots only. The current version comes from
the existing CHUNITHM version provider, including its regional release dates
and 07:00 JST rollover. Historical-version requests fail before fetching.
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
  `14+` → `145` for CHUNITHM. Known source constants are not replaced. The same
  pure helper powers maimai’s existing FillMissingFetcher, retaining its current
  `.6` / historical `.7` plus thresholds and mismatch correction. Completed
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
  BPM.
- The source maps typed upstream records into pending charts, following the
  maimai provider. Shared finalization validates required fields and numeric
  codes before persistence. Chart identity is still game/title/chart
  type/difficulty; the source ID is retained as provenance, not yet used to
  reconcile future song renames.

## Verification

Small unmodified excerpts of both public datasets are stored alongside provider
tests in `apps/main/src/server/services/catalog/chunithm/fixtures`. The snapshots were
read on 2026-09-26; source Git blob IDs were
`2dddbe4815bfc0abb22d485935fdb5bfd201602a` (JP) and
`e78d65e5ec93851a34d6f2fc5b239412e94af8b7` (International).

Full snapshots passed through the shared source, Fill Missing and Sorter stages:
6,843 regular JP charts (2,261 known constants) and 6,363 International charts
(2,242 known constants), all with numeric `levelPrecise` and `addedVersion`. These are
source coverage observations, not minimum counts enforced against future
releases. Focused tests cover regional availability, required-field finalization, missing
metadata, numeric codes, fallback thresholds, ULTIMA, WORLD'S END exclusion,
HTTP failures, release rollover, shared stage order and attribution notices. No database ingestion is required to run them.

## Admin requests

Invoke the admin API on the tomomai instance for either game, independently of
`FRONTEND_GAME`:

- `/api/admin/update?game=chunithm&region=jp` collects and returns the catalog.
- `/api/admin/update_all?game=chunithm&region=jp&image_upload=false` runs the
  catalog ingestion workflow. Use `region=intl` for International.

Existing admin authentication remains required. A game account token is not
required for this public provider. Ingestion and publication still need the
existing database/R2 configuration; these commands are not run by the tests.

For example, on the tomomai instance:

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
