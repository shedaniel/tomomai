# CHUNITHM catalog

The initial provider is [otoge-db](https://github.com/zvuc/otoge-db). It collects
regular BASIC, ADVANCED, EXPERT, MASTER and ULTIMA charts into the common catalog
pipeline. Catalog requests select the game explicitly; the frontend game's
configuration does not select an ingestion provider. No CHUNITHM-NET session is
needed. Configuring this catalog does not enable CHUNITHM player fetching or the
public frontend.

## Sources and versions

| Region | Dataset | Catalog version |
| --- | --- | --- |
| JP | `chunithm/data/music-ex.json` | Mate (9) |
| International | `chunithm/data/music-ex-intl.json` | X-VERSE-X (8) |

Both files come from `https://raw.githubusercontent.com/zvuc/otoge-db/main/`.
Cover images use the same repository's `chunithm/jacket/<image>` path.
Collection also reads the explicit `CURRENT_JP_VER` and `CURRENT_INTL_VER` string
declarations in `scripts/chunithm/game.py`; it never executes that Python code.
Missing, unrecognized or changed release declarations fail collection so a new
source release cannot silently overwrite an older catalog version. Changes to
the provider's declaration format require updating this parser.

This provider supports the current configured snapshots only. Historical-version
requests fail before fetching. Updating to a new release requires checking its
regional version metadata and updating the configured dataset version. The
source's per-song `version` is the original **Japanese** release, so it cannot be
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
- BASIC–MASTER use the region's song-added date. ULTIMA uses the region's chart
  update date where available. Missing ULTIMA dates remain unknown, rather than
  inheriting the original song release. The local pre-NEW International version
  table has overlapping release dates, so ambiguous dates remain unknown too.
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
- Malformed source records, unknown difficulty prefixes or version names, and
  duplicate regular-song IDs/titles fail the entire collection. Current shared
  chart identity is still game/title/chart type/difficulty; the source ID is
  retained as provenance, not yet used to reconcile future song renames.

## Verification

Small unmodified excerpts of both public datasets are stored alongside provider
tests in `apps/main/src/lib/games/adapters/chunithm/fixtures`. The snapshots were
read on 2026-09-26; source Git blob IDs were
`2dddbe4815bfc0abb22d485935fdb5bfd201602a` (JP) and
`e78d65e5ec93851a34d6f2fc5b239412e94af8b7` (International).

Full-snapshot normalization produced 6,843 regular JP charts (2,261 known
constants) and 6,363 International charts (2,242 known constants). These are
source coverage observations, not minimum counts enforced against future
releases. Focused tests cover source validation, regional availability, missing
metadata, numeric codes, fallback thresholds, ULTIMA, WORLD'S END exclusion, HTTP failures and release
rollover checks. No database ingestion is required to run them.

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

The backend remains one new migration version (`0018`) relative to
`upstream/main`. Its regenerated definition keeps `levelPrecise` required and
allows unknown `addedVersion`. A dev database that already applied an earlier
`0018` will not receive edits to that same migration by rerunning the migrator.
Use a database copy from before that migration or arrange a separately reviewed
reconciliation before ingestion. This implementation does not apply migrations.
