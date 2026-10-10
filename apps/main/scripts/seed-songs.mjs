/**
 * Seeds a local database with the public song catalogue from tomomai.lol and
 * mirrors the catalogue JSON into the local S3 bucket, so /api/v1/songs works.
 *
 *   pnpm db:seed
 *
 * Env (from .env.local): POSTGRES_URL, R2_* (optional, skips the mirror if unset).
 * SEED_SOURCE_URL overrides the source site (default https://www.tomomai.lol).
 * Refuses to run against anything but a local database.
 */
import { config } from "dotenv";
import postgres from "postgres";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

config({ path: ".env.local" });

const SOURCE = (process.env.SEED_SOURCE_URL || "https://www.tomomai.lol").replace(/\/$/, "");
const CATALOG_PREFIX = "api/v1/catalog-parent-v1";
const REGIONS = ["jp", "intl", "cn"];
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

const dbUrl = process.env.POSTGRES_URL;
if (!dbUrl) throw new Error("POSTGRES_URL is not set");
const dbHost = new URL(dbUrl).hostname;
if (!LOCAL_HOSTS.has(dbHost)) {
  throw new Error(`Refusing to seed non-local database host "${dbHost}"`);
}

const sql = postgres(dbUrl, { max: 4, onnotice: () => {} });
const s3 = process.env.R2_ENDPOINT && process.env.R2_BUCKET
  ? new S3Client({
      region: "auto",
      endpoint: process.env.R2_ENDPOINT,
      forcePathStyle: process.env.R2_FORCE_PATH_STYLE === "true",
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    })
  : null;

async function fetchText(path) {
  const res = await fetch(`${SOURCE}${path}`, { redirect: "follow" });
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
  return res.text();
}

async function mirror(key, body) {
  if (!s3) return;
  await s3.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET,
    Key: key,
    Body: body,
    ContentType: "application/json; charset=utf-8",
    CacheControl: "public, max-age=3600",
  }));
}

async function mapLimit(items, limit, fn) {
  const results = [];
  let next = 0;
  await Promise.all(Array.from({ length: limit }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }));
  return results;
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function seedParents() {
  const body = await fetchText("/api/v1/parents");
  const { parents } = JSON.parse(body);
  for (const batch of chunk(parents, 2000)) {
    await sql`
      insert into parent_song ${sql(batch.map((p) => ({
        publicId: p.songId,
        songName: p.songName,
        artist: p.artist,
        genre: p.genre,
        cover: p.cover ?? "",
        bpm: p.bpm,
        type: p.type,
        difficulty: p.difficulty,
        disambiguator: p.disambiguator,
      })))}
      on conflict ("publicId") do update set
        "songName" = excluded."songName", artist = excluded.artist, genre = excluded.genre,
        cover = excluded.cover, bpm = excluded.bpm, type = excluded.type,
        difficulty = excluded.difficulty, disambiguator = excluded.disambiguator
    `;
  }
  await mirror(`${CATALOG_PREFIX}/parents`, body);

  const rows = await sql`select id, "publicId" from parent_song`;
  return new Map(rows.map((r) => [r.publicId, r.id]));
}

async function seedSlice(parentIds, region, gameVersion) {
  const body = await fetchText(`/api/v1/songs?region=${region}&gameVersion=${gameVersion}`);
  const { songs } = JSON.parse(body);
  const rows = songs.map((s) => {
    const parentId = parentIds.get(s.songId.split(":")[0]);
    if (parentId === undefined) throw new Error(`Unknown parent for ${s.songId}`);
    return {
      parentId,
      level: s.level,
      levelPrecise: s.levelPrecise,
      region,
      gameVersion,
      addedVersion: s.addedVersion,
      noteDesigner: s.noteDesigner,
    };
  });
  for (const batch of chunk(rows, 2000)) {
    await sql`
      insert into songs ${sql(batch)}
      on conflict ("parentId", region, "gameVersion") do update set
        level = excluded.level, "levelPrecise" = excluded."levelPrecise",
        "addedVersion" = excluded."addedVersion", "noteDesigner" = excluded."noteDesigner"
    `;
  }
  await mirror(`${CATALOG_PREFIX}/songs/${region}/${gameVersion}`, body);
  return rows.length;
}

async function main() {
  console.log(`Seeding songs from ${SOURCE}${s3 ? "" : " (no R2_* env, skipping catalogue mirror)"}`);
  const parentIds = await seedParents();
  console.log(`  ${parentIds.size} parent charts`);

  for (const region of REGIONS) {
    const { versions } = JSON.parse(await fetchText(`/api/v1/songs/versions?region=${region}`));
    const counts = await mapLimit(versions, 4, (v) => seedSlice(parentIds, region, v.id));
    const total = counts.reduce((a, b) => a + b, 0);
    console.log(`  ${region}: ${total} charts across ${versions.length} versions`);
  }
}

try {
  await main();
} finally {
  await sql.end();
}
