# Setup — Data Service (`apps/data`)

The data service owns the **catalog**: maimai chart (song) data and tour event data. It scrapes the upstream sources, maintains the canonical database where every chart gets its globally stable integer id, and publishes the catalog as a versioned artifact to object storage. The main app — official instance and self-hosted instances alike — never scrapes; it loads the published artifact (see the root `SETUP.md` → *Populating Catalog Data*).

Self-hosters do **not** run this service. It exists so that one host (the official instance) does the scraping and everyone else just points at the result.

## Architecture

```
apps/data  (this service, own Postgres)
  scrapers: maimai-mobile, maimai_songs.json, dxrating, otoge-db, lxns (CN)
  AI event fetcher: gamerch.com via OpenRouter
  cover pipeline: download -> WebP -> R2 (covers/<hash>.webp)
  publish: catalog/catalog-<sequence>.json.gz + catalog/latest.json -> R2

apps/main  (user data, official + self-hosted)
  GET /api/cron/catalog-sync (scheduled) or POST /api/admin/catalog-sync
  downloads latest.json -> verifies sha256 -> upserts songs/parents/events by id
```

The artifact contract (zod schemas, schema version) lives in `packages/catalog/src/artifact.ts`. Catalog tables: `parent_song` is the chart itself (name, artist, genre, cover, bpm, type, difficulty — stable across regions and versions, owns the public API id); `songs` is one chart instance per region + game version (level, levelPrecise, addedVersion, note metadata). User data in the main app references `songs.id`.

## Environment Variables

### Database

| Variable | Required | Description |
|---|---|---|
| `POSTGRES_URL` | Yes | The data service's own PostgreSQL database (not the main app's) |
| `REDIS_URL` | Yes | Redis connection string, used for pending-confirmation storage and scrape caches |

### Auth

| Variable | Required | Description |
|---|---|---|
| `ADMIN_UPDATE_TOKEN` | Yes | Bearer token for the admin routes and the cron route (`/api/cron/update`), sent by the external scheduler (e.g. Cronicle). Generate with `openssl rand -base64 32` |

### Cloudflare R2

Receives the converted cover images and the published catalog artifacts.

| Variable | Required | Description |
|---|---|---|
| `R2_ENDPOINT` | Yes | R2 S3-compatible endpoint URL |
| `R2_ACCESS_KEY_ID` | Yes | R2 access key ID |
| `R2_SECRET_ACCESS_KEY` | Yes | R2 secret access key |
| `R2_BUCKET` | Yes | R2 bucket name |

### Scraping

| Variable | Required | Description |
|---|---|---|
| `MAIMAI_TOKEN_JP` | For jp cron | maimai session token (`account://USER:://PASS` format) used by the scheduled JP scrape |
| `MAIMAI_TOKEN_INTL` | For intl cron | Same for INTL (`cookie://VALUE` also supported) |
| `NEXT_PUBLIC_ENABLED_REGIONS` | No | Comma-separated list of enabled regions (defaults to `intl,jp`) |

CN needs no token — it uses the public Lxns API.

### Events (AI fetcher)

| Variable | Required | Description |
|---|---|---|
| `OPENROUTER_KEY` | For events | OpenRouter API key for the AI event fetcher |
| `AI_MODEL` | No | Model override for the event fetcher |

### Discord Notifications

| Variable | Required | Description |
|---|---|---|
| `DISCORD_UPDATE_WEBHOOK` | No | Webhook for public update notifications |
| `DISCORD_UPDATE_WEBHOOK_JP` / `_INTL` / `_CN` | No | Per-region override of `DISCORD_UPDATE_WEBHOOK` |
| `DISCORD_UPDATE_WEBHOOK_NOTICE` | No | Webhook for admin notices incl. event confirmation buttons — keep the channel private |

### App Configuration

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` (or `SITE_URL`) | No | Public base URL of this service, used in links sent to Discord. Falls back to the Vercel-provided URL when deployed there |
| `LOG_LEVEL` | No | Log level (defaults to `trace` in dev, `info` in prod) |

### Seed Script Only

Read by `scripts/seed-from-main.js`, not by the running service:

| Variable | Required | Description |
|---|---|---|
| `SEED_SOURCE_POSTGRES_URL` | For seeding | The main app's database to copy the existing catalog (with its ids) from |
| `SEED_COVER_BASE_URL` | No | Cover URLs under this base are converted to object keys (defaults to the official CDN) |

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

### Scheduled updates

There is a single cron endpoint; schedule it per region from your external scheduler (e.g. Cronicle):

```bash
curl "https://data.yourdomain.com/api/cron/update?region=jp" \
  -H "Authorization: Bearer $ADMIN_UPDATE_TOKEN"
```

It runs the full update → covers → upsert → publish pipeline for that region, reading the maimai session from `MAIMAI_TOKEN_JP` / `MAIMAI_TOKEN_INTL` (CN needs no token).

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

- `GET /api/v1/parents` — all charts, identified by their public 8-char nanoid (`songId`)
- `GET /api/v1/songs?region=&gameVersion=` — chart instances, identified by the composite id `<chartId>:<regionLetter><gameVersion>` (e.g. `abcd:j11` = jp @ version 11; regions `j`/`i`/`c`, versions may be negative). Truncate at `:` for the chart id
- `GET /api/v1/events` — tour events (identified by name) with reward steps

Internal integer ids are never exposed here; they only travel inside the published artifact, which is host-to-host infrastructure consumed by the main app's catalog sync.

## Publishing details

- `catalog/catalog-<sequence>.json.gz` — immutable, the full catalog with explicit integer ids (`schemaVersion`, monotonically increasing `sequence`).
- `catalog/latest.json` — small mutable manifest (`sequence`, `sha256`, artifact `url`, counts) with a 5-minute cache.
- Consumers compare `sequence` against their stored `catalog_state` row and no-op when unchanged; the sha256 is verified before loading.
- Every publish is recorded in the `catalog_releases` table.
