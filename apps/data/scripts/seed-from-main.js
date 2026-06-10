// Seeds the data service's canonical catalog from a main-app database.
//
// The main app's existing ids become the global baseline: every artifact
// published afterwards carries the same ids, so user-data FKs on the official
// instance remain valid and self-hosters load an identical id space.
//
//   SEED_SOURCE_POSTGRES_URL=postgres://... (main app DB, post parent_song migration)
//   POSTGRES_URL=postgres://...             (data service DB, migrated, empty catalog)
//   SEED_COVER_BASE_URL=https://cdn.tomomai.lol (optional; cover URLs under this
//     base are stored as object keys, anything else passes through verbatim)
//
//   node scripts/seed-from-main.js

import postgres from "postgres";

const sourceUrl = process.env.SEED_SOURCE_POSTGRES_URL;
const targetUrl = process.env.POSTGRES_URL;
const coverBase = (process.env.SEED_COVER_BASE_URL ?? "https://cdn.tomomai.lol").replace(/\/$/, "");

if (!sourceUrl || !targetUrl) {
  console.error("SEED_SOURCE_POSTGRES_URL and POSTGRES_URL are required");
  process.exit(1);
}

const source = postgres(sourceUrl, { prepare: false });
const target = postgres(targetUrl, { prepare: false });

function coverToKey(cover) {
  if (cover.startsWith(`${coverBase}/`)) {
    return cover.slice(coverBase.length + 1);
  }
  return cover;
}

async function main() {
  const parents = await source`
    SELECT id, "publicId", "songName", artist, genre, cover, bpm, type, difficulty, disambiguator
    FROM parent_song`;
  const songs = await source`
    SELECT id, "parentId", region, "gameVersion", "addedVersion", level, "levelPrecise",
      "noteDesigner", "tapCount", "holdCount", "slideCount", "touchCount", "breakCount"
    FROM songs`;
  const events = await source`SELECT id, name, periods, "createdAt", "updatedAt" FROM tour_events`;
  const steps = await source`SELECT id, "eventId", distance, type, reward FROM tour_event_steps`;

  console.log(`Source: ${parents.length} parents, ${songs.length} songs, ${events.length} events, ${steps.length} steps`);

  const unparented = songs.filter(s => s.parentId === null);
  if (unparented.length > 0) {
    throw new Error(`${unparented.length} songs rows have no parentId; run the parent_song backfill first`);
  }

  await target.begin(async (tx) => {
    const existing = await tx`SELECT COUNT(*)::int AS count FROM parent_song`;
    if (existing[0].count > 0) {
      throw new Error("Target catalog is not empty; refusing to seed");
    }

    for (const batch of chunk(parents, 1000)) {
      await tx`INSERT INTO parent_song ${tx(batch.map(p => ({ ...p, cover: coverToKey(p.cover) })))}`;
    }
    for (const batch of chunk(songs, 1000)) {
      await tx`INSERT INTO songs ${tx(batch)}`;
    }
    for (const batch of chunk(events, 1000)) {
      await tx`INSERT INTO tour_events ${tx(batch)}`;
    }
    for (const batch of chunk(steps, 1000)) {
      await tx`INSERT INTO tour_event_steps ${tx(batch)}`;
    }

    await tx`SELECT setval(pg_get_serial_sequence('parent_song', 'id'), COALESCE((SELECT MAX(id) FROM parent_song), 1))`;
    await tx`SELECT setval(pg_get_serial_sequence('songs', 'id'), COALESCE((SELECT MAX(id) FROM songs), 1))`;
    await tx`SELECT setval(pg_get_serial_sequence('tour_events', 'id'), COALESCE((SELECT MAX(id) FROM tour_events), 1))`;
    await tx`SELECT setval(pg_get_serial_sequence('tour_event_steps', 'id'), COALESCE((SELECT MAX(id) FROM tour_event_steps), 1))`;
  });

  console.log("Seed complete. Publish the first artifact with POST /api/admin/publish.");
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await source.end();
    await target.end();
  });
