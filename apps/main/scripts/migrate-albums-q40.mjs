// One-time backfill: re-encode existing album images from AVIF q80 to q40,
// overwriting the same R2 key and updating user_albums.imageSize. Shrinks every
// user ~65% so nobody is pruned by the new 8 MB cap. Creds from .env.local via
// regex (never printed). Idempotent: skips objects that don't shrink >=15%
// (i.e. already q40). Cache-Control is preserved, so the CDN may serve the old
// q80 bytes until the 1-year TTL lapses; the DB size (storage meter) updates now.
//
// Usage:
//   node scripts/migrate-albums-q40.mjs --dry-run [--limit N]   # preview only
//   node scripts/migrate-albums-q40.mjs [--limit N] [--concurrency N]
import fs from "node:fs";
import sharp from "sharp";
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import postgres from "postgres";

const env = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const get = (k) => {
  const m = env.match(new RegExp(`^${k}\\s*=\\s*["']?([^"'\\n]+)["']?\\s*$`, "m"));
  return m ? m[1] : undefined;
};

const DRY = process.argv.includes("--dry-run");
const argVal = (flag, def) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? Number(process.argv[i + 1]) : def;
};
const LIMIT = argVal("--limit", 0);          // 0 = all
const CONCURRENCY = argVal("--concurrency", 8);
const QUALITY = 40;
const EFFORT = 6;
const SHRINK_THRESHOLD = 0.85;               // only write if new < old * 0.85

const fmt = (b) => {
  if (!b) return "0 B";
  const k = 1024, s = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return `${Math.round(b / Math.pow(k, i) * 100) / 100} ${s[i]}`;
};

const sql = postgres(get("POSTGRES_URL_PROD"), { ssl: "require", max: Math.max(2, Math.ceil(CONCURRENCY / 2)) });
const r2 = new S3Client({
  region: "auto",
  endpoint: get("R2_ENDPOINT"),
  credentials: { accessKeyId: get("R2_ACCESS_KEY_ID"), secretAccessKey: get("R2_SECRET_ACCESS_KEY") },
});
const BUCKET = get("R2_BUCKET");

const streamToBuffer = async (stream) => {
  const chunks = [];
  for await (const c of stream) chunks.push(c);
  return Buffer.concat(chunks);
};

const stats = { processed: 0, migrated: 0, skipped: 0, errored: 0, before: 0, after: 0 };

async function migrateOne({ id, imageKey, imageSize }) {
  stats.processed++;
  try {
    const obj = await r2.send(new GetObjectCommand({ Bucket: BUCKET, Key: imageKey }));
    const orig = await streamToBuffer(obj.Body);
    const out = await sharp(orig).avif({ quality: QUALITY, effort: EFFORT }).toBuffer();

    // Use the actual current object size as the baseline (DB may drift).
    if (out.length >= orig.length * SHRINK_THRESHOLD) {
      stats.skipped++;
      stats.before += Number(imageSize);
      stats.after += Number(imageSize);
      return;
    }

    if (!DRY) {
      await r2.send(new PutObjectCommand({
        Bucket: BUCKET,
        Key: imageKey,
        Body: out,
        ContentType: "image/avif",
        CacheControl: "public, max-age=31536000",
      }));
      await sql`UPDATE user_albums SET "imageSize" = ${out.length} WHERE id = ${id}`;
    }
    stats.migrated++;
    stats.before += orig.length;
    stats.after += out.length;
  } catch (err) {
    stats.errored++;
    console.error(`  ERROR ${imageKey}: ${err.message ?? err}`);
  }
}

// simple concurrency pool
async function runPool(items, worker, concurrency) {
  let idx = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (idx < items.length) {
      const item = items[idx++];
      await worker(item);
      if (stats.processed % 200 === 0) {
        console.log(`  ...${stats.processed}/${items.length} (migrated ${stats.migrated}, skipped ${stats.skipped}, err ${stats.errored})`);
      }
    }
  });
  await Promise.all(workers);
}

try {
  const rows = LIMIT
    ? await sql`SELECT id, "imageKey", "imageSize" FROM user_albums ORDER BY id LIMIT ${LIMIT}`
    : await sql`SELECT id, "imageKey", "imageSize" FROM user_albums ORDER BY id`;

  console.log(`${DRY ? "[DRY RUN] " : ""}Migrating ${rows.length} albums -> AVIF q${QUALITY}, concurrency ${CONCURRENCY}\n`);
  await runPool(rows, migrateOne, CONCURRENCY);

  console.log("\n=== Done ===");
  console.log(`processed : ${stats.processed}`);
  console.log(`migrated  : ${stats.migrated}${DRY ? " (would migrate)" : ""}`);
  console.log(`skipped   : ${stats.skipped} (already small / not worth it)`);
  console.log(`errored   : ${stats.errored}`);
  console.log(`size before: ${fmt(stats.before)}`);
  console.log(`size after : ${fmt(stats.after)}  (${stats.before ? (stats.after / stats.before * 100 - 100).toFixed(1) : 0}%)`);
  if (DRY) console.log("\nDry run only - nothing was written. Re-run without --dry-run to apply.");
} finally {
  await sql.end();
}
