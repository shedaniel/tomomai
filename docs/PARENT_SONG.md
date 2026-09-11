# Parent chart catalog

The catalog separates canonical charts from their region/version instances.
Scraping, imports, events, covers, and catalog publication live in `apps/data`.
User data and a local catalog replica live in `apps/main`. See
[the catalog service](CATALOG_SERVICE.md) for synchronization and rollout.

## Identity and persistence

`parent_song` is one chart, including type and difficulty, across regions and
versions. It stores the canonical name, artist, cover, genre and BPM. `songs`
stores each parent's region/version instance, levels, addedVersion, note
designer and counts. Existing integer song IDs and user references survive
the backfill. Parent deletion is restricted while any child exists.

Uploads and imports resolve parents and preserve child IDs. Catalog writes
are serialized with a transaction advisory lock, as is publication. Upload
matching reserves exact artist matches before weaker fallbacks, so a new
colliding chart cannot take a known chart's identity. Main synchronization retains removed instances referenced by scores, recent
plays, or albums. The data service retains removed instance identities for
reuse if a chart returns. Orphan parents are retained.

Percentile bands aggregate each player's best score by parent identity across
versions, retaining the existing international-player population policy.
Score sources without sufficient information to distinguish same-name charts
leave ambiguous matches unresolved rather than storing scores on the wrong
chart. This can omit a score for a colliding name until the provider supplies
enough identifying data.

## Public contract

- Parent ID: eight characters from the nanoid alphabet, e.g. `Ab3xK9pQ`.
- Instance ID: `<parentId>:<regionLetter><gameVersion>`, e.g. `Ab3xK9pQ:j14`.
  Region letters are `j`, `i`, `c`; historical versions can be negative.
- `GET /api/v1/parents` returns the canonical chart dictionary.
- `GET /api/v1/songs?region=jp&gameVersion=14` returns one supported slice.
  Both parameters are required. Missing/malformed/unsupported slices return
  a client error before any catalog lookup.
- `GET /api/v1/songs/versions?region=jp` returns version metadata, including
  the current version used by the guess app.
- `GET /api/v1/songs/Ab3xK9pQ:j14` resolves the exact instance; a bare parent
  ID resolves a preferred child (latest version, then JP preference).

These are breaking API changes. Old 21-character song IDs are not aliases for
the new IDs. All first-party consumers change together. Render tokens use v2
with fixed 10-byte instance IDs; old tokens are rejected and must be minted
again. See [the wire format](render-token-v2.md).

## Publication and caching

The public dictionary and song slices are validated and uploaded to the new
`api/v1/catalog-parent-v1` R2 prefix. The API keeps redirecting catalog requests
to R2, preserving CDN delivery instead of restoring per-request database reads.
Every metadata-supported slice is published, including empty ones, to replace
stale contents when the last song in a slice disappears. Unknown versions are
rejected before catalog writes. Shared catalog version metadata remains the
authority, including MAGiCAL and CiRCLE PLUS release dates.

The publisher holds the shared catalog advisory lock from its joined read
through the uploads, preventing an older publisher from overwriting newer
data. Uploads have individual timeouts, and in-flight batches finish before
the lock is released. R2 has no transaction across objects: a failed batch can
leave some objects updated. Failure is returned to the caller; retrying
publication rebuilds every object. CDN caches can retain older objects until
their TTL expires. Parent IDs remain stable across successful updates.

Guess retains its daily memo. Render caches the exact slices named by each
token's chart IDs, including historical or mixed-version plays. Main catalog
cache keys have a new namespace while existing invalidation tags remain valid.

## Deployment

The parent schema is the baseline for catalog extraction. Follow the
[catalog service rollout](CATALOG_SERVICE.md#coordinated-rollout) when moving
catalog ownership to the data service. Existing song IDs and user references
must be preserved by seeding before enabling synchronization.

## Verification evidence

The 2026-09-11 read-only public catalog audit covered 52,127 instances across
nine region/version slices. The initial grouping audit produced 6,519 parents.
The four standard Link difficulty groups each split into the two expected
artists; the audit found no duplicate parent/region/version assignments or
over-splitting. This checks current public data, not hidden database state or
the execution of the migration SQL itself. The collision matcher now handles
artist renames by matching slices one to one. A pure implementation of that
matching algorithm passed seven rename/ambiguity fixtures and reproduced
6,519 parents from the same cached catalog, with no ambiguous assignments or
duplicate children. This does not execute the migration SQL or establish that
every deployment database is unambiguous.

Tests cover collision resolution, upload matching, supported versions, public
IDs, API lookup predicates, catalog publication/retry, percentile results,
ambiguous score ingestion, render-token round trips and render slice caching.
No schema-application commands were run during development.
