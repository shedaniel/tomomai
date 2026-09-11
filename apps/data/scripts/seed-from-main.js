// Seeds the data service's canonical catalog from a main-app database.
//
// The main app's existing ids become the global baseline: every artifact
// published afterwards carries the same ids, so user-data FKs on the official
// instance remain valid and self-hosters load an identical id space.
//
//   SEED_SOURCE_POSTGRES_URL=postgres://... (main app DB, post parent_song migration)
//   POSTGRES_URL=postgres://...             (data service DB, migrated, empty catalog)
//
//   node scripts/seed-from-main.js

import postgres from "postgres";
import pino from "pino";
const log = pino();

const sourceUrl = process.env.SEED_SOURCE_POSTGRES_URL;
const targetUrl = process.env.POSTGRES_URL;

if (!sourceUrl || !targetUrl) {
  log.error("SEED_SOURCE_POSTGRES_URL and POSTGRES_URL are required");
  process.exit(1);
}

const source = postgres(sourceUrl, { prepare: false });
const target = postgres(targetUrl, { prepare: false });

async function main() {
  const { parents, songs, events, steps } = await source.begin("isolation level repeatable read read only", async (source) => {
  const parents = await source`
    SELECT id, "publicId", "songName", artist, genre, cover, bpm, type, difficulty, disambiguator
    FROM parent_song`;
  const songs = await source`
    SELECT id, "parentId", region, "gameVersion", "addedVersion", level, "levelPrecise",
      "noteDesigner", "tapCount", "holdCount", "slideCount", "touchCount", "breakCount"
    FROM songs`;
  const events = await source`SELECT id, name, periods, "createdAt", "updatedAt" FROM tour_events`;
  const steps = await source`SELECT id, "eventId", distance, type, reward FROM tour_event_steps`;

  return { parents, songs, events, steps };
  });
  log.info({ songCount: songs.length, eventCount: events.length }, "Loaded source catalog");

  const unparented = songs.filter(s => s.parentId === null);
  if (unparented.length > 0) {
    throw new Error(`${unparented.length} songs rows have no parentId; run the parent_song backfill first`);
  }

  await target.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(73641932)`;
    const existing = await tx`SELECT ((SELECT count(*) FROM parent_song) + (SELECT count(*) FROM songs) + (SELECT count(*) FROM tour_events) + (SELECT count(*) FROM tour_event_steps) + (SELECT count(*) FROM catalog_releases) + (SELECT count(*) FROM retired_song_ids))::int AS count`;
    if (existing[0].count > 0) {
      throw new Error("Target catalog is not empty; refusing to seed");
    }

    for (const batch of chunk(parents, 1000)) {
      await tx`INSERT INTO parent_song ${tx(batch)}`;
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

  log.info("Seed complete. Publish the first artifact with POST /api/admin/publish.");
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

main()
  .catch((err) => {
    log.error({ err }, "Seed failed");
    process.exitCode = 1;
  })
  .finally(async () => {
    await source.end();
    await target.end();
  });
