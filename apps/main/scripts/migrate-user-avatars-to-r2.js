/**
 * One-off backfill: migrate `user.image` from Discord/Twitter CDN URLs to R2 object URLs.
 *
 * - Selects rows where image IS NOT NULL and doesn't already start with our R2 base URL.
 * - For each: GET the remote avatar, sha256 the bytes → key `avatars/<hash>.<ext>`, PUT if missing.
 * - 200 → UPDATE image to R2 URL.
 * - 404/403/410/non-image/empty (DEAD): with --null-dead, UPDATE image = NULL; without, just count.
 * - 5xx/timeout/network (TRANSIENT): always skip, never null — next run retries.
 *
 * Suggested rollout: run once without --null-dead to see the counts, then re-run with --null-dead.
 *
 * Usage:
 *   node scripts/migrate-user-avatars-to-r2.js [--dry-run] [--batch-size=200] [--null-dead]
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
const NULL_DEAD = process.argv.includes("--null-dead");
const BATCH_SIZE = (() => {
  const arg = process.argv.find((a) => a.startsWith("--batch-size="));
  return arg ? parseInt(arg.split("=")[1], 10) : 200;
})();
const CONCURRENCY = (() => {
  const arg = process.argv.find((a) => a.startsWith("--concurrency="));
  return arg ? parseInt(arg.split("=")[1], 10) : 1;
})();
const FETCH_TIMEOUT_MS = 5000;

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

const sql = postgres(POSTGRES_URL, { max: CONCURRENCY + 4 });
const r2 = new S3Client({
  region: "auto",
  endpoint: R2_ENDPOINT,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
});
const PUBLIC_BASE = NEXT_PUBLIC_R2_URL.replace(/\/$/, "");
const PUBLIC_BASE_PREFIX = `${PUBLIC_BASE}/`;

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
  const key = `avatars/${hash}.${extensionForContentType(contentType)}`;
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

// Returns { kind: "ok", url, uploaded } | { kind: "dead" } | { kind: "transient" }
async function mirrorOne(remoteUrl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(remoteUrl, { signal: controller.signal, redirect: "follow" });
  } catch {
    return { kind: "transient" };
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 404 || response.status === 403 || response.status === 410) {
    return { kind: "dead" };
  }
  if (response.status >= 500) {
    return { kind: "transient" };
  }
  if (!response.ok) {
    return { kind: "dead" };
  }

  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  if (!contentType.startsWith("image/")) {
    return { kind: "dead" };
  }

  let buffer;
  try {
    buffer = Buffer.from(await response.arrayBuffer());
  } catch {
    return { kind: "transient" };
  }
  if (buffer.length === 0) {
    return { kind: "dead" };
  }

  const { url, uploaded } = await uploadIfMissing(buffer, contentType);
  return { kind: "ok", url, uploaded, bytes: buffer.length };
}

async function main() {
  console.log(`[migrate-user-avatars] mode=${DRY_RUN ? "DRY-RUN" : "LIVE"} batch=${BATCH_SIZE} concurrency=${CONCURRENCY} nullDead=${NULL_DEAD}`);

  const [{ count }] = await sql`
    SELECT count(*)::int AS count
    FROM "user"
    WHERE image IS NOT NULL
      AND image NOT LIKE ${PUBLIC_BASE_PREFIX + "%"}
  `;
  console.log(`[migrate-user-avatars] rows pending migration: ${count}`);

  let processed = 0;
  let swapped = 0;
  let uploadedObjects = 0;
  let uploadedBytes = 0;
  let deadSeen = 0;
  let deadNulled = 0;
  let transientSkipped = 0;
  let lastId = "";

  while (true) {
    const rows = await sql`
      SELECT id, image
      FROM "user"
      WHERE image IS NOT NULL
        AND image NOT LIKE ${PUBLIC_BASE_PREFIX + "%"}
        AND id > ${lastId}
      ORDER BY id ASC
      LIMIT ${BATCH_SIZE}
    `;
    if (rows.length === 0) break;

    let cursor = 0;
    const worker = async () => {
      while (cursor < rows.length) {
        const row = rows[cursor++];
        processed++;

        const result = await mirrorOne(row.image);

        if (result.kind === "ok") {
          if (result.uploaded) {
            uploadedObjects++;
            uploadedBytes += result.bytes;
          }
          if (!DRY_RUN) {
            await sql`UPDATE "user" SET image = ${result.url} WHERE id = ${row.id}`;
          }
          swapped++;
        } else if (result.kind === "dead") {
          deadSeen++;
          console.log(`[migrate-user-avatars] DEAD user=${row.id} url=${row.image}`);
          if (NULL_DEAD && !DRY_RUN) {
            await sql`UPDATE "user" SET image = NULL WHERE id = ${row.id}`;
            deadNulled++;
          }
        } else {
          transientSkipped++;
          console.warn(`[migrate-user-avatars] TRANSIENT user=${row.id} url=${row.image} (skipped, will retry next run)`);
        }

        if (processed % 100 === 0) {
          console.log(`[migrate-user-avatars] processed=${processed}/${count} swapped=${swapped} dead=${deadSeen} transient=${transientSkipped}`);
        }
      }
    };

    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    lastId = rows[rows.length - 1].id;

    if (DRY_RUN) {
      console.log("[migrate-user-avatars] dry-run: stopping after first batch to avoid loop");
      break;
    }
  }

  console.log(`[migrate-user-avatars] done.`);
  console.log(`  processed:         ${processed}`);
  console.log(`  swapped to R2:     ${swapped}`);
  console.log(`  unique R2 keys:    ${knownKeys.size}`);
  console.log(`  objects uploaded:  ${uploadedObjects}`);
  console.log(`  bytes uploaded:    ${uploadedBytes}`);
  console.log(`  dead seen:         ${deadSeen}`);
  console.log(`  dead nulled:       ${deadNulled}${NULL_DEAD ? "" : " (re-run with --null-dead to commit)"}`);
  console.log(`  transient skipped: ${transientSkipped}`);

  await sql.end({ timeout: 5 });
}

main().catch(async (err) => {
  console.error("[migrate-user-avatars] fatal:", err);
  try { await sql.end({ timeout: 5 }); } catch {}
  process.exit(1);
});
