/**
 * Seeds a local database with the public song catalogues (maimai from tomomai.lol,
 * CHUNITHM from chu.tomomai.lol) and mirrors the catalogue JSON into the local S3
 * bucket, so /api/v1/games/{game}/songs works.
 *
 *   pnpm db:seed
 *
 * Env (from .env.local): POSTGRES_URL, R2_* (optional, skips the mirror if unset).
 * SEED_MAIMAI_URL and SEED_CHUNITHM_URL override each game's source site.
 * Refuses to run against anything but a local database.
 */
import { config } from "dotenv";
import postgres from "postgres";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

config({ path: ".env.local" });

const SOURCES = {
  maimai: process.env.SEED_MAIMAI_URL || "https://www.tomomai.lol",
  chunithm: process.env.SEED_CHUNITHM_URL || "https://chu.tomomai.lol",
};
// Must match catalogPrefix() in src/lib/api/catalog-location.ts.
const CATALOG_PREFIX = "catalog/v2";
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

function sourceUrl(game, path) {
  return `${SOURCES[game].replace(/\/$/, "")}/api/v1/games/${game}${path}`;
}

async function fetchText(game, path) {
  const url = sourceUrl(game, path);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.text();
}

// Regions are enabled per deployment, so a region the source does not serve is skipped.
async function fetchVersions(game, region) {
  const url = sourceUrl(game, `/songs/versions?region=${region}`);
  const res = await fetch(url, { redirect: "follow" });
  const body = await res.json().catch(() => null);
  if (res.status === 400 && body?.code === "UNSUPPORTED_REGION") return null;
  if (!res.ok || !body) throw new Error(`GET ${url} -> ${res.status}`);
  return body.versions;
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

async function seedParents(game) {
  const body = await fetchText(game, "/parents");
  const { parents } = JSON.parse(body);
  for (const batch of chunk(parents, 2000)) {
    await sql`
      insert into parent_song ${sql(batch.map((p) => ({
        publicId: p.songId,
        game,
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
  await mirror(`${CATALOG_PREFIX}/${game}/parents`, body);

  const rows = await sql`select id, "publicId" from parent_song where game = ${game}`;
  return new Map(rows.map((r) => [r.publicId, r.id]));
}

// Matches catalogMetadataSchema in src/lib/catalog/chart-metadata.ts: a flag is present only when true.
function chartMetadata(song) {
  const metadata = {
    ...(song.levelPreciseEstimated === true && { levelPreciseEstimated: true }),
    ...(song.addedVersionEstimated === true && { addedVersionEstimated: true }),
  };
  return Object.keys(metadata).length > 0 ? metadata : null;
}

async function seedSlice(game, parentIds, region, gameVersion) {
  const body = await fetchText(game, `/songs?region=${region}&gameVersion=${gameVersion}`);
  const { songs } = JSON.parse(body);
  const rows = songs.map((s) => {
    const parentId = parentIds.get(s.songId.split(":")[0]);
    if (parentId === undefined) throw new Error(`Unknown parent for ${s.songId}`);
    return {
      parentId,
      game,
      metadata: chartMetadata(s),
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
        "addedVersion" = excluded."addedVersion", "noteDesigner" = excluded."noteDesigner",
        metadata = excluded.metadata
    `;
  }
  await mirror(`${CATALOG_PREFIX}/${game}/songs/${region}/${gameVersion}`, body);
  return rows.length;
}

async function seedGame(game) {
  console.log(`Seeding ${game} from ${SOURCES[game]}`);
  const parentIds = await seedParents(game);
  console.log(`  ${parentIds.size} parent charts`);

  for (const region of REGIONS) {
    const versions = await fetchVersions(game, region);
    if (!versions) {
      console.log(`  ${region}: not served, skipped`);
      continue;
    }
    const counts = await mapLimit(versions, 4, (v) => seedSlice(game, parentIds, region, v.id));
    const total = counts.reduce((a, b) => a + b, 0);
    console.log(`  ${region}: ${total} charts across ${versions.length} versions`);
  }
}

async function main() {
  if (!s3) console.log("No R2_* env, skipping catalogue mirror");
  for (const game of Object.keys(SOURCES)) await seedGame(game);
}

try {
  await main();
} finally {
  await sql.end();
}
