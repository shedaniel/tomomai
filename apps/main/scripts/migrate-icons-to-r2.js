/**
 * One-off backfill: migrate `user_snapshots.iconUrl` from base64 data URLs to R2 object URLs.
 *
 * - Streams rows where iconUrl LIKE 'data:%' (idempotent: re-runs skip migrated rows).
 * - Decodes base64 → Buffer, content-addresses by sha256 → key `icons/<hash>.<ext>`.
 * - HeadObject precheck (cached in-process for the run); PutObject if missing.
 * - UPDATE iconUrl to public R2 URL.
 *
 * Usage:
 *   node scripts/migrate-icons-to-r2.js [--dry-run] [--batch-size=200]
 *
 * Required env:
 *   POSTGRES_URL
 *   R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
 *   NEXT_PUBLIC_R2_URL  (e.g. https://cdn.tomomai.lol)
 */

import { config as dotenvConfig } from "dotenv";
import postgres from "postgres";
import crypto from "crypto";
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";

dotenvConfig({ path: ".env.local" });
dotenvConfig({ path: ".env" });

const DRY_RUN = process.argv.includes("--dry-run");
const BATCH_SIZE = (() => {
  const arg = process.argv.find((a) => a.startsWith("--batch-size="));
  return arg ? parseInt(arg.split("=")[1], 10) : 200;
})();

const {
  POSTGRES_URL,
  R2_ENDPOINT,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET,
  NEXT_PUBLIC_R2_URL,
} = process.env;

for (const [name, value] of Object.entries({
  POSTGRES_URL,
  R2_ENDPOINT,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET,
  NEXT_PUBLIC_R2_URL,
})) {
  if (!value) {
    console.error(`Error: ${name} must be set`);
    process.exit(1);
  }
}

const sql = postgres(POSTGRES_URL);
const r2 = new S3Client({
  region: "auto",
  endpoint: R2_ENDPOINT,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
});
const PUBLIC_BASE = NEXT_PUBLIC_R2_URL.replace(/\/$/, "");

const knownKeys = new Set();

function extensionForContentType(ct) {
  const t = ct.toLowerCase();
  if (t.includes("png")) return "png";
  if (t.includes("jpeg") || t.includes("jpg")) return "jpg";
  if (t.includes("webp")) return "webp";
  if (t.includes("gif")) return "gif";
  if (t.includes("avif")) return "avif";
  return "png";
}

function parseDataUrl(dataUrl) {
  // data:{contentType};base64,{payload}
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/s);
  if (!m) return null;
  const contentType = m[1];
  const buffer = Buffer.from(m[2], "base64");
  return { contentType, buffer };
}

async function r2HasKey(key) {
  if (knownKeys.has(key)) return true;
  try {
    await r2.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    knownKeys.add(key);
    return true;
  } catch (err) {
    const status = err?.$metadata?.httpStatusCode;
    if (status === 404 || err?.name === "NotFound" || err?.name === "NoSuchKey") return false;
    throw err;
  }
}

async function uploadIfMissing(buffer, contentType) {
  const hash = crypto.createHash("sha256").update(buffer).digest("hex");
  const key = `icons/${hash}.${extensionForContentType(contentType)}`;
  const url = `${PUBLIC_BASE}/${key}`;

  if (await r2HasKey(key)) {
    return { key, url, uploaded: false };
  }

  if (!DRY_RUN) {
    await r2.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }));
  }
  knownKeys.add(key);
  return { key, url, uploaded: true };
}

async function main() {
  console.log(`[migrate-icons] mode=${DRY_RUN ? "DRY-RUN" : "LIVE"} batch=${BATCH_SIZE}`);

  const [{ count }] = await sql`
    SELECT count(*)::int AS count
    FROM user_snapshots
    WHERE "iconUrl" LIKE 'data:%'
  `;
  console.log(`[migrate-icons] rows pending migration: ${count}`);

  let processed = 0;
  let updated = 0;
  let uploadedObjects = 0;
  let uploadedBytes = 0;
  let skippedBadRows = 0;

  while (true) {
    const rows = await sql`
      SELECT id, "iconUrl"
      FROM user_snapshots
      WHERE "iconUrl" LIKE 'data:%'
      ORDER BY id ASC
      LIMIT ${BATCH_SIZE}
    `;
    if (rows.length === 0) break;

    for (const row of rows) {
      const parsed = parseDataUrl(row.iconUrl);
      if (!parsed) {
        skippedBadRows++;
        console.warn(`[migrate-icons] row ${row.id}: unparseable iconUrl, skipping`);
        continue;
      }

      const { key, url, uploaded } = await uploadIfMissing(parsed.buffer, parsed.contentType);
      if (uploaded) {
        uploadedObjects++;
        uploadedBytes += parsed.buffer.length;
      }

      if (!DRY_RUN) {
        await sql`UPDATE user_snapshots SET "iconUrl" = ${url} WHERE id = ${row.id}`;
      }
      updated++;
      processed++;

      if (processed % 100 === 0) {
        console.log(`[migrate-icons] processed=${processed}/${count} uploads=${uploadedObjects} uniqueKeys=${knownKeys.size}`);
      }

      void key;
    }

    if (DRY_RUN) {
      // In dry-run, the WHERE filter still matches these rows; break to avoid an infinite loop.
      console.log("[migrate-icons] dry-run: stopping after first batch to avoid loop");
      break;
    }
  }

  console.log(`[migrate-icons] done.`);
  console.log(`  rows updated:      ${updated}`);
  console.log(`  unique keys seen:  ${knownKeys.size}`);
  console.log(`  objects uploaded:  ${uploadedObjects}`);
  console.log(`  bytes uploaded:    ${uploadedBytes}`);
  console.log(`  skipped bad rows:  ${skippedBadRows}`);

  if (!DRY_RUN && updated > 0) {
    await reclaimTableSpace();
  }

  await sql.end({ timeout: 5 });
}

async function reclaimTableSpace() {
  const sizeBefore = await sql`SELECT pg_size_pretty(pg_total_relation_size('user_snapshots')) AS s`;
  console.log(`[migrate-icons] user_snapshots size before VACUUM FULL: ${sizeBefore[0].s}`);
  console.log(`[migrate-icons] running VACUUM (FULL, ANALYZE) user_snapshots — table is briefly locked...`);

  const t0 = Date.now();
  // VACUUM cannot run inside a transaction; .simple() bypasses the prepared-statement path.
  await sql.unsafe(`VACUUM (FULL, ANALYZE) user_snapshots`).simple();
  console.log(`[migrate-icons] VACUUM done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  const sizeAfter = await sql`SELECT pg_size_pretty(pg_total_relation_size('user_snapshots')) AS s`;
  console.log(`[migrate-icons] user_snapshots size after VACUUM FULL:  ${sizeAfter[0].s}`);
}

main().catch(async (err) => {
  console.error("[migrate-icons] fatal:", err);
  try { await sql.end({ timeout: 5 }); } catch {}
  process.exit(1);
});
