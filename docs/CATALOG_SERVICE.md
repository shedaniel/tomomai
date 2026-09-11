# Catalog service

`apps/data` owns chart and tour-event ingestion in a separate PostgreSQL
catalog database. `apps/main` owns user data and keeps a local catalog replica
for joins. Self-hosted main instances load the same published catalog without
running scrapers or configuring catalog storage credentials.

`packages/catalog` holds the shared schema, metadata, public IDs, parent
matching, and artifact contract. `packages/server` holds reusable HTTP, image,
and object-storage helpers. User asset handling remains in main.

## Identity and publication

Seed the data database from the authoritative main database before starting
catalog jobs. The seed preserves every parent public ID, parent integer ID,
song integer ID, and tour-event ID. Removed chart instances retain their IDs
in a private ledger, so re-adding the same instance reconnects existing scores. It refuses a nonempty target. Independent
catalogs cannot be combined by importing one over the other: existing scores
reference their original chart IDs.

Each publication creates a gzip artifact containing the full catalog and a
SHA-256 manifest at `catalog/latest.json`. Bigint IDs travel as decimal strings
to avoid JavaScript precision loss. Sequence allocation is monotonic and does
not reuse a failed publication's artifact key. Artifact validation rejects
missing references, duplicate IDs and duplicate chart identities.

Catalog writes and publication share an advisory lock. The immutable artifact
and public parent/song slices are uploaded before the manifest is advanced.
A failed upload leaves the manifest on the previous release. Public slices
are separate R2 objects, so a failed batch can partially update those slices;
retry publication to repair them. CDN caching can temporarily serve an older
release. Keep the database, release sequence, and published artifact namespace
together when backing up or restoring the data service.

## Main synchronization

Main fetches the manifest and validates the artifact's checksum, schema,
sequence, timestamp, counts, and identities before writing. Downloads and
expanded payloads have size limits. Syncs serialize their transaction, reject
older releases and conflicting checksums for the same sequence, and do not
silently repoint user data to a different chart. A source change requires
explicit operator reconciliation.

The local catalog state is updated atomically with parent, song, and event
rows. Parents are retained. Songs removed upstream are deleted only when no
scores, recent plays, or albums reference them; retained songs remain usable
for historical user records. Tour events and steps mirror the artifact,
including empty catalogs. Successful sync invalidates catalog caches.

The parent/song public API keeps its existing IDs and R2 delivery contract.
Main's `CATALOG_URL` selects the catalog storage base, independent of main's
user-asset bucket. Exact chart lookup still reads main's local replica. Render
token v2 and the render/guess API contracts are unchanged. Render's own
`CATALOG_URL` remains an API origin (main or data), whereas main's value is the
storage base. Configure environment variables per app rather than sharing one
value across all deployments.

## Coordinated rollout

1. Back up the authoritative main database. Pause existing catalog ingestion
   and event jobs during the ownership transfer.
2. Have the deployment mechanism apply the new main migration
   `0018_catalog_replica.sql`. It adds sync bookkeeping and permits
   explicit catalog IDs; it does not backfill or renumber catalog rows.
3. Deploy the data service against its own database, initialized with its
   generated initial migration. Configure its private admin endpoints,
   scraper credentials, Redis, and catalog R2 bucket as described in
   [data setup](../apps/data/SETUP.md).
4. Run the manual seed from the authoritative main database, then publish
   the first artifact. Verify its counts, public IDs, integer IDs, covers,
   current/historical slices, and checksum before syncing any main instance.
5. Deploy main with the catalog storage URL and sync it. Compare rows and
   user references before/after the first sync. The official instance should
   retain its exact identities. A fresh self-hosted instance starts empty.
6. Schedule data ingestion and main sync separately. Main cron sync uses
   `CRON_SECRET`; manual sync uses `ADMIN_UPDATE_TOKEN`. Stop calling the
   removed main ingestion routes.
7. Rehearse a repeated sync, metadata update, new chart, removed referenced
   chart, empty event set, failed publication, and conflicting identity.

Rollback must restore one catalog writer. Disable data jobs before restoring
main's former ingestion deployment; never run both writers concurrently.
Keep the previous artifacts and backups available until the cutover is
verified. This change does not repair pre-existing catalog metadata gaps.

## Validation boundary

Unit and mocked transaction tests cover artifact validation, publication order,
sync checks, identity protection, and guarded deletion. Schema generation is
not schema application. Production-clone seed/publish/sync and migration
rehearsals must be performed separately by the deployment operator; development
checks do not establish that those external operations have succeeded.
