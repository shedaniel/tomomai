# Data Service (`apps/data`)

The data service owns the **catalog**: maimai chart (song) data and tour event data. It scrapes the upstream sources, maintains the canonical database where every chart gets its globally stable integer id, and publishes the catalog as a versioned artifact to object storage. The main app — official instance and self-hosted instances alike — never scrapes; it loads the published artifact (see `SETUP.md` → *Populating Catalog Data*).

Self-hosters do **not** run this service. It exists so that one host (the official instance) does the scraping and everyone else just points at the result.

## Architecture

```
apps/data  (this service, own Postgres)
  scrapers: maimai-mobile, maimai_songs.json, dxrating, otoge-db, lxns (CN)
  AI event fetcher: gamerch.com via OpenRouter
  cover pipeline: download -> WebP -> R2 (covers/<hash>.webp)
  publish: catalog/catalog-<sequence>.json.gz + catalog/latest.json -> R2

apps/main  (user data, official + self-hosted)
  /api/cron/catalog-sync (daily) or POST /api/admin/catalog-sync
  downloads latest.json -> verifies sha256 -> upserts songs/parents/events by id
```

The artifact contract (zod schemas, schema version) lives in `packages/catalog/src/artifact.ts`. Catalog tables: `parent_song` is the chart itself (name, artist, genre, cover, bpm, type, difficulty — stable across regions and versions, owns the public API id); `songs` is one chart instance per region + game version (level, levelPrecise, addedVersion, note metadata). User data in the main app references `songs.id`.

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `POSTGRES_URL` | Yes | The data service's own PostgreSQL database (not the main app's) |
| `REDIS_URL` | Yes | Redis, used for pending-confirmation storage and scrape caches |
| `ADMIN_UPDATE_TOKEN` | Yes | Bearer token for the admin routes |
| `CRON_SECRET` | Yes (prod) | Bearer token Vercel sends to the cron routes |
| `R2_ENDPOINT` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` | Yes | R2 bucket that receives covers and catalog artifacts |
| `MAIMAI_TOKEN_JP` | For jp cron | maimai session token (`account://USER:://PASS` or cookie format) used by the scheduled JP scrape |
| `MAIMAI_TOKEN_INTL` | For intl cron | Same for INTL (`cookie://VALUE` also supported) |
| `OPENROUTER_KEY` | For events | OpenRouter API key for the AI event fetcher |
| `AI_MODEL` | No | Model override for the event fetcher |
| `DISCORD_UPDATE_WEBHOOK` | No | Webhook for public update notifications |
| `DISCORD_UPDATE_WEBHOOK_NOTICE` | No | Webhook for admin notices incl. event confirmation buttons — keep the channel private |

## Initial setup

```bash
pnpm --filter @tomomai/data db:migrate
```

### Seeding from an existing main database

If you are migrating an existing tomomai deployment (the official instance), the canonical ids must come from the existing database so user-data foreign keys stay valid:

```bash
SEED_SOURCE_POSTGRES_URL=postgres://...main-db... \
POSTGRES_URL=postgres://...data-db... \
pnpm --filter @tomomai/data seed:from-main

# then publish artifact sequence 1
curl -X POST "https://data.yourdomain.com/api/admin/publish" \
  -H "Authorization: Bearer $ADMIN_UPDATE_TOKEN"
```

A brand-new independent deployment can skip the seed and just run the scrapers; ids are assigned fresh.

## Updating songs

Same commands as the old main-app flow, now against the data service. Each successful `update_all` publishes a new artifact automatically:

```bash
curl -X POST "https://data.yourdomain.com/api/admin/update_all?region=jp&token=account://<sega-username>:://<sega-password>" \
  -H "Authorization: Bearer $ADMIN_UPDATE_TOKEN"
```

The scheduled crons in `apps/data/vercel.json` (`/api/cron/update-{jp,intl,cn}`, daily, staggered) run the same pipeline using `MAIMAI_TOKEN_JP` / `MAIMAI_TOKEN_INTL` (CN uses the public Lxns API and needs no token).

### Preparing a new game version

```bash
curl "https://data.yourdomain.com/api/admin/import?from=version<=12@jp-12&to=jp-13" \
  -H "Authorization: Bearer $ADMIN_UPDATE_TOKEN"
```

Because chart identity lives on `parent_song`, importing copies the chart *instances* to the new version under the same parents — no duplicate charts are created.

## Updating events

```bash
curl -X POST "https://data.yourdomain.com/api/admin/events/fetch" \
  -H "Authorization: Bearer $ADMIN_UPDATE_TOKEN"
```

Then confirm via the Discord notice channel, as before. Confirming publishes a new artifact.

## Public read API

Unauthenticated, served by the data service:

- `GET /api/v1/parents` — all charts (canonical identity + stable attributes)
- `GET /api/v1/songs?region=&gameVersion=` — chart instances
- `GET /api/v1/events` — tour events with reward steps

## Publishing details

- `catalog/catalog-<sequence>.json.gz` — immutable, the full catalog with explicit integer ids (`schemaVersion`, monotonically increasing `sequence`).
- `catalog/latest.json` — small mutable manifest (`sequence`, `sha256`, artifact `url`, counts) with a 5-minute cache.
- Consumers compare `sequence` against their stored `catalog_state` row and no-op when unchanged; the sha256 is verified before loading.
- Every publish is recorded in the `catalog_releases` table.
