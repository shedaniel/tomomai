# CHUNITHM catalog

The CHUNITHM catalog comes from [otoge-db](https://github.com/zvuc/otoge-db) and needs no CHUNITHM-NET session. It runs through the shared catalog pipeline ([MULTI_GAME.md](MULTI_GAME.md#where-things-live)): the source stage for the region, then the shared Fill Missing stage with CHUNITHM's level policy, completion, persistence, publication and cache invalidation. The source is [`server/services/games/chunithm/catalog/sources/otoge-db.ts`](../apps/main/src/server/services/games/chunithm/catalog/sources/otoge-db.ts), with excerpts of both datasets as test fixtures beside it.

## Source selection

- JP reads `chunithm/data/music-ex.json` and International `chunithm/data/music-ex-intl.json`, both from `https://raw.githubusercontent.com/zvuc/otoge-db/main/`.
- International drops entries with `intl: "0"` (not available there), and JP drops entries with `intl: "2"` (International only).
- WORLD'S END entries (those with `we_kanji` or `we_star`) are dropped, including variants that share a title with a regular chart. The deleted-song archive is not imported. The remaining charts are BASIC, ADVANCED, EXPERT, MASTER and ULTIMA.
- Only the current version is collected. It comes from the CHUNITHM version table (`lib/games/chunithm/versions.ts`) and its regional release dates, so a new release needs only a new row there. Requests for a historical version fail before fetching.

## Normalization

- The displayed level and the optional `lev_*_i` chart constant are kept apart. A known `14.2` becomes `levelPrecise: 142`. Fill Missing estimates an absent constant from the displayed level (`14` becomes `140`, `14+` becomes `145`) and never replaces a known one. A later confirmed constant replaces an estimate, and an estimate never overwrites a known constant for an unchanged display level. A chart whose constant cannot be resolved fails validation instead of being dropped.
- `addedVersion` comes from the regional release date. BASIC to MASTER use the regional song-added date. ULTIMA prefers the regional chart-update date and falls back to the song-added date, which can place a later ULTIMA chart in an earlier release, so that fallback is marked estimated.
- The source's per-song `version` is the original JP release and is not used as the International version. It only breaks ties between International releases that share a date, and an unambiguous regional date always wins, so a JP Mate song released internationally during X-VERSE-X stays version 8.
- `songs.metadata` follows `catalogMetadataSchema` ([`lib/catalog/chart-metadata.ts`](../apps/main/src/lib/catalog/chart-metadata.ts)), which rejects any other key. It holds `levelPreciseEstimated` and `addedVersionEstimated`, written only when true, the source id as `source: { provider: "otoge-db", id }`, and the note counts per kind as `noteCounts`. Air and flick counts are not coerced into maimai note kinds, and non-numeric BPM text leaves the BPM unknown. The public API publishes the two estimate flags and the note counts (read through `readChunithmNoteCounts`), never the raw metadata.
- Titles are kept as the source spells them. CHUNITHM has no title normalization, so `/api/admin/db?type=normalize&game=chunithm` answers 422. Chart identity is game, title, chart type and difficulty, and the source id is provenance only.

## Covers

The site cannot load otoge-db covers, so CHUNITHM requires hosted covers. Each jacket from `chunithm/jacket/<image>` is converted to WebP and stored at `${NEXT_PUBLIC_R2_URL}/covers/chunithm/<source-basename>.webp`, shared by both regions. Existing objects are not downloaded again. `update_all` with `image_upload=false` answers 400, and a write whose covers still point at otoge-db is refused. An image failure aborts that region before anything is stored.

## Admin requests

Every admin request names its game and needs the `ADMIN_UPDATE_TOKEN` bearer token. No game account token is involved.

- `GET /api/admin/update?game=chunithm&region=jp` collects a region and returns the charts without writing. It may run on any deployment.
- `GET /api/admin/update_all?game=chunithm` collects, hosts covers, stores and publishes every enabled region (International, then JP), or every region while none is enabled. Add `region=jp` or `region=intl` for one region.
- Writes (`update_all`, `upload`, `import`, `db` and `catalog/publish`) must run on the CHUNITHM deployment, whose `FRONTEND_GAME` is `chunithm`, because only it renders CHUNITHM's pages. Any other deployment answers 409. After a write, the CHUNITHM deployment asks every origin in `CATALOG_PEER_ORIGINS` to drop its cached copy of the CHUNITHM API, so each deployment lists the others there and all share one `ADMIN_UPDATE_TOKEN`.

A region's publication rebuilds all of CHUNITHM's catalog objects, so a JP update also republishes International. To replace covers in an existing catalog, run both regions, because International alone may leave covers of JP-preferred parents unchanged.

```sh
curl --fail-with-body \
  -H 'Authorization: Bearer <ADMIN_UPDATE_TOKEN>' \
  'https://tomochu.app/api/admin/update_all?game=chunithm'
```
