// One-shot migration: rewrite maimaidx Music cover URLs in the prod `songs`
// table to their pre-optimized R2 webp equivalents, uploading any missing webps
// first. Read-only unless invoked with --apply.
//
//   node scripts/migrate-covers-to-r2.mjs          # dry run (no writes)
//   node scripts/migrate-covers-to-r2.mjs --apply   # upload missing + rewrite DB
import fs from "node:fs";
import postgres from "postgres";
import sharp from "sharp";
import { Agent } from "undici";
import { S3Client, ListObjectsV2Command, PutObjectCommand } from "@aws-sdk/client-s3";

const APPLY = process.argv.includes("--apply");

const env = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const get = (k) => {
  const m = env.match(new RegExp(`^${k}\\s*=\\s*["']?([^"'\\n]+)["']?\\s*$`, "m"));
  return m ? m[1] : undefined;
};

const R2_BASE = get("NEXT_PUBLIC_R2_URL"); // https://cdn.tomomai.lol
const BUCKET = get("R2_BUCKET");
const agent = new Agent({ connect: { rejectUnauthorized: false } });

const sql = postgres(get("POSTGRES_URL_PROD"), { ssl: "require", max: 1 });
const r2 = new S3Client({
  region: "auto",
  endpoint: get("R2_ENDPOINT"),
  credentials: { accessKeyId: get("R2_ACCESS_KEY_ID"), secretAccessKey: get("R2_SECRET_ACCESS_KEY") },
});

const MUSIC_RE = `^https?://maimaidx(-eng)?\\.(jp|com)/maimai-mobile/img/Music/`;

async function listCoverKeys() {
  const keys = new Set();
  let token;
  do {
    const res = await r2.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: "covers/", ContinuationToken: token }));
    for (const o of res.Contents ?? []) if (o.Key) keys.add(o.Key.replace(/^covers\//, ""));
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return keys;
}

async function pool(items, conc, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: conc }, async () => {
    while (i < items.length) { const idx = i++; await fn(items[idx], idx); }
  }));
}

try {
  console.log(APPLY ? "MODE: APPLY (will write)\n" : "MODE: DRY RUN (no writes)\n");

  // md5 -> a source URL to download from (prefer the .jp URL actually in the DB)
  const rows = await sql`
    SELECT DISTINCT
      regexp_replace(cover, '^.*/Music/([^/]+)\\.png$', '\\1') AS md5,
      cover AS url
    FROM songs
    WHERE cover ~ ${MUSIC_RE}
  `;
  const md5ToUrl = new Map();
  for (const r of rows) if (!md5ToUrl.has(r.md5)) md5ToUrl.set(r.md5, r.url);
  console.log("distinct cover filenames:", md5ToUrl.size);

  const r2Keys = await listCoverKeys();
  const missing = [...md5ToUrl.keys()].filter(md5 => !r2Keys.has(`${md5}.webp`));
  console.log("already in R2:", md5ToUrl.size - missing.length, " missing:", missing.length);

  // Upload missing webps
  const present = new Set([...md5ToUrl.keys()].filter(md5 => r2Keys.has(`${md5}.webp`)));
  let uploaded = 0;
  const failed = [];
  if (missing.length) {
    console.log(`\n${APPLY ? "Uploading" : "[dry] would upload"} ${missing.length} missing covers...`);
    await pool(missing, 6, async (md5) => {
      const url = md5ToUrl.get(md5);
      try {
        const res = await fetch(url, { dispatcher: agent, headers: { "User-Agent": "Mozilla/5.0" } });
        if (!res.ok) throw new Error(`fetch ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        const webp = await sharp(buf).webp({ quality: 80 }).toBuffer();
        if (APPLY) {
          await r2.send(new PutObjectCommand({
            Bucket: BUCKET, Key: `covers/${md5}.webp`, Body: webp,
            ContentType: "image/webp", CacheControl: "public, max-age=31536000",
          }));
        }
        present.add(md5);
        uploaded++;
      } catch (e) {
        failed.push(`${md5}: ${e.message}`);
      }
    });
    console.log(`${APPLY ? "uploaded" : "would upload"}: ${uploaded}, failed: ${failed.length}`);
    if (failed.length) console.log("failures:\n  " + failed.join("\n  "));
  }

  // Rewrite DB rows for confirmed-present filenames
  const presentArr = [...present];
  const toRewrite = await sql`
    SELECT count(*)::int AS n FROM songs
    WHERE cover ~ ${MUSIC_RE}
      AND regexp_replace(cover, '^.*/Music/([^/]+)\\.png$', '\\1') = ANY(${sql.array(presentArr)})
  `;
  console.log(`\nrows to rewrite (covers present in R2): ${toRewrite[0].n}`);

  if (APPLY) {
    const res = await sql`
      UPDATE songs
      SET cover = ${R2_BASE} || '/covers/' || regexp_replace(cover, '^.*/Music/([^/]+)\\.png$', '\\1') || '.webp'
      WHERE cover ~ ${MUSIC_RE}
        AND regexp_replace(cover, '^.*/Music/([^/]+)\\.png$', '\\1') = ANY(${sql.array(presentArr)})
    `;
    console.log(`rewrote ${res.count} rows`);

    const remaining = await sql`SELECT count(*)::int AS n FROM songs WHERE cover ~ ${MUSIC_RE}`;
    console.log(`remaining maimaidx Music covers in DB: ${remaining[0].n}`);
  } else {
    console.log("[dry] re-run with --apply to upload + rewrite");
  }
} finally {
  await sql.end();
}
