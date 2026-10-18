/**
 * Copies the chart percentile bands from production into a local database, so
 * score percentiles and peer-aware recommendations work without local players.
 *
 *   pnpm db:seed:percentiles
 *
 * Env (from .env.local): POSTGRES_URL (local target), POSTGRES_URL_PROD (read only).
 * Run after `pnpm db:seed`: charts are matched by parent publicId, since internal
 * ids differ between databases, and bands for charts missing locally are skipped.
 *
 * Locally the bands land in a plain table under the materialized view's name, so
 * the percentile cron's REFRESH fails there until it is dropped. Pass --drop to
 * remove it.
 * Refuses to write to anything but a local database.
 */
import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });

const VIEW = "chart_percentile_bands_all_regions";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const BATCH = 2000;

const localUrl = process.env.POSTGRES_URL;
if (!localUrl) throw new Error("POSTGRES_URL is not set");
const localHost = new URL(localUrl).hostname;
if (!LOCAL_HOSTS.has(localHost)) {
  throw new Error(`Refusing to write to non-local database host "${localHost}"`);
}

const local = postgres(localUrl, { max: 2, onnotice: () => {} });

async function dropLocal() {
  const [{ kind } = {}] = await local`SELECT relkind AS kind FROM pg_class WHERE relname = ${VIEW}`;
  if (kind === "m") await local.unsafe(`DROP MATERIALIZED VIEW ${VIEW}`);
  else if (kind) await local.unsafe(`DROP TABLE ${VIEW}`);
}

async function main() {
  if (process.argv.includes("--drop")) {
    await dropLocal();
    console.log(`Dropped local ${VIEW}`);
    return;
  }

  const prodUrl = process.env.POSTGRES_URL_PROD;
  if (!prodUrl) throw new Error("POSTGRES_URL_PROD is not set");
  const prod = postgres(prodUrl, { max: 1, ssl: "require", onnotice: () => {} });

  try {
    const localParents = new Map(
      (await local`SELECT id, "publicId" FROM parent_song`).map((row) => [row.publicId, row.id]),
    );
    if (localParents.size === 0) throw new Error("No local parent_song rows, run `pnpm db:seed` first");

    await dropLocal();
    await local.unsafe(`
      CREATE TABLE ${VIEW} (
        parent_id bigint NOT NULL,
        band_lo smallint NOT NULL,
        achievements integer[] NOT NULL,
        player_count integer NOT NULL,
        PRIMARY KEY (parent_id, band_lo)
      )
    `);

    let copied = 0;
    let skipped = 0;
    await prod`
      SELECT p."publicId" AS public_id, v.band_lo, v.achievements, v.player_count
      FROM ${prod(VIEW)} v
      JOIN parent_song p ON p.id = v.parent_id
    `.cursor(BATCH, async (rows) => {
      const mapped = rows.flatMap((row) => {
        const parentId = localParents.get(row.public_id);
        if (parentId == null) {
          skipped++;
          return [];
        }
        return [{ parent_id: parentId, band_lo: row.band_lo, achievements: row.achievements, player_count: row.player_count }];
      });
      if (mapped.length) {
        await local`INSERT INTO ${local(VIEW)} ${local(mapped, "parent_id", "band_lo", "achievements", "player_count")}`;
      }
      copied += mapped.length;
    });

    console.log(`Copied ${copied} percentile bands, skipped ${skipped} for charts missing locally`);
  } finally {
    await prod.end();
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => local.end());
