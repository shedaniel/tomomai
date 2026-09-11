# Catalog data service

`apps/data` owns catalog ingestion in a separate PostgreSQL database. Main applications import its immutable catalog releases while keeping user data locally. The public parent dictionary and region/version song slices retain the existing API contract.

## Configuration

Set `POSTGRES_URL` to the data database, `REDIS_URL` to its Redis instance, and `ADMIN_UPDATE_TOKEN` to a private administration secret. Configure `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, and `NEXT_PUBLIC_R2_URL` for publication and cover storage. The main application needs read access only to the publication URL.

Optional ingestion settings include `ENABLED_REGIONS`, `MAIMAI_TOKEN_JP`, `MAIMAI_TOKEN_INTL`, the existing source-provider credentials, Discord webhook URLs, and OpenRouter credentials for event extraction. Configure `NEXT_PUBLIC_SITE_URL` with the data service origin so confirmation links reach this service. Keep these credentials separate from main.

Run `pnpm --filter @tomomai/data dev` to serve on port 3002. Deploy this app independently with its own environment and scheduling.

## Initial transfer

An operator must provision the data database using the generated schema migration through the deployment process. Do not apply migrations from an agent session.

Stop catalog writers in main before transfer. With an empty target catalog, manually run `pnpm --filter @tomomai/data seed:from-main` with `SEED_SOURCE_POSTGRES_URL` pointing to main and `POSTGRES_URL` pointing to data. The script reads one consistent source snapshot, refuses a nonempty target, preserves chart IDs, public IDs, cover values and event IDs, and advances identity sequences. It does not read credential files or generate new IDs for existing rows.

Call authenticated `POST /api/admin/publish` and configure main to sync the resulting manifest before enabling ingestion here. Do not run writers in both services. Retain a backup and rehearse this handover in an isolated environment first.

## Operation

- `GET /api/admin/update_all?region=jp&token=...` fetches sources, processes covers, writes the region catalog and publishes. The current INTL and JP authentication/source behavior is retained.
- `GET /api/cron/update?region=jp` uses the configured region token; schedule externally with `Authorization: Bearer <ADMIN_UPDATE_TOKEN>`.
- Existing `update`, `image`, `upload`, `import` and event administration routes live here.
- `POST /api/admin/publish` retries publication without scraping or changing catalog rows.
- `GET /api/v1/parents`, `/api/v1/songs?region=jp&gameVersion=...` and `/api/v1/events` provide public reads.

Catalog mutations and publication share a PostgreSQL advisory lock. Publication validates the complete artifact before uploading anything, reserves a nonreusable sequence, uploads a gzip artifact and all public dictionary/slice objects, then updates `catalog/latest.json` last. Empty slices are published as well. Failed publication can leave unused immutable objects or partially updated public slices; retry publication to complete all objects. Consumers using the manifest keep the last complete release until the pointer advances.

Artifacts encode bigint IDs as decimal strings. Their checksum covers the compressed bytes. Importers must validate schema, checksum, identities and references before applying a release. Canonical removals have no user-reference checks in data; main importers must preserve locally referenced instances. Data retains removed instance IDs in a private identity ledger and reuses them when the same parent/region/version returns; retired instances stay out of published artifacts.

No database migration, seed, ingestion, or object publication occurs during tests or builds.
