/**
 * Fills a local guess database with fake players and solves so leaderboards,
 * stats and streaks have something to show. Every signed-in (real) player
 * also gets a play history for past days they haven't played. Local only.
 *
 *   pnpm --filter @tomomai/guess seed:leaderboard [--days 30] [--players 40]
 *   pnpm --filter @tomomai/guess seed:leaderboard --clean
 */
import { parseArgs } from "node:util";
import { and, eq, isNotNull, like, notLike, sql } from "drizzle-orm";
import { getRealTodayKey } from "../src/lib/date-slug";
import { DAY_MS, dayStart, shiftDateKey } from "../src/lib/day";
import { closeDb, getDb } from "../src/lib/db";
import { attempts, players } from "../src/lib/db/schema";
import { getMode } from "../src/lib/heardle-config";
import type { StepResult } from "../src/lib/progress";
import { HINT_COUNT } from "../src/lib/types";

const SEED_PREFIX = "seed:";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

const NAMES = [
  "kanade", "mizuki_dx", "rinrin", "sora-p", "hoshino", "tetsuya", "aoi_mai", "nekomata",
  "yuzu", "kaito_fc", "shirasu", "momiji", "taiko_no_tatsu", "lumi", "ayame", "pikoko",
  "ryusei", "minato", "chiffon", "akatsuki", "kuro", "hinata_ap", "suisei", "nagi",
  "milk_tea", "zenith", "tsubame", "orion", "kotone", "shion", "mochi", "rei_sss",
  "haru", "fubuki", "kiri", "sakuya", "ponzu", "mint", "yoru", "ember",
];

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** Results for one finished game; `hints` = hints seen when solved, 0 = lost. */
function resultsFor(hints: number, rand: () => number): StepResult[] {
  if (hints === 0) {
    return Array.from({ length: HINT_COUNT }, () => (rand() < 0.6 ? "incorrect" : "skipped"));
  }
  const misses = Array.from({ length: hints - 1 }, (): StepResult =>
    rand() < 0.5 ? "incorrect" : "skipped",
  );
  return [...misses, "correct"];
}

async function main() {
  const { values } = parseArgs({
    options: {
      days: { type: "string", default: "30" },
      players: { type: "string", default: "40" },
      clean: { type: "boolean", default: false },
    },
  });
  const url = process.env.POSTGRES_URL;
  if (!url) throw new Error("POSTGRES_URL is not set");
  const host = new URL(url).hostname;
  if (!LOCAL_HOSTS.has(host)) throw new Error(`Refusing to seed non-local database host "${host}"`);

  const db = getDb()!;
  await db.delete(players).where(like(players.tomomaiUserId, `${SEED_PREFIX}%`));
  await db.delete(attempts).where(like(attempts.guestId, "seedguest-%"));
  if (values.clean) {
    console.log("removed seeded players");
    return;
  }

  const mode = getMode();
  const days = Number(values.days);
  const count = Math.min(Number(values.players), NAMES.length);
  const today = getRealTodayKey();
  const now = Date.now();
  const rand = rng(42);

  const seeded = await db
    .insert(players)
    .values(
      NAMES.slice(0, count).map((name, i) => ({
        tomomaiUserId: `${SEED_PREFIX}${name}`,
        username: i % 9 === 4 ? null : name,
        showOnLeaderboard: i % 13 !== 7,
      })),
    )
    .returning({ id: players.id });

  // Each fake player has a skill level that shapes their hint counts and how often they show up.
  const rows: (typeof attempts.$inferInsert)[] = [];
  seeded.forEach(({ id }, i) => {
    const skill = rand();
    const attendance = 0.35 + rand() * 0.6;
    const earlyBird = rand();
    for (let d = 0; d < days; d++) {
      const dateKey = shiftDateKey(today, -d);
      if (rand() > attendance) continue;
      const start = dayStart(dateKey).getTime();
      const late = d > 0 && rand() < 0.06;
      let startedAt =
        start + (late ? DAY_MS + rand() * DAY_MS * 4 : (earlyBird * 0.5 + rand() * 0.5) * DAY_MS);
      if (startedAt > now - 60_000) startedAt = start + rand() * Math.max(60_000, now - start - 60_000);
      const finishedAt = Math.min(now, startedAt + 20_000 + rand() * 240_000);
      const lost = rand() > 0.55 + skill * 0.4;
      const hints = lost
        ? 0
        : Math.max(1, Math.min(HINT_COUNT, Math.round(1 + (1 - skill) * (HINT_COUNT - 1) * rand() * 1.4)));
      const playing = d === 0 && i % 11 === 3;
      const results = playing ? resultsFor(3, rand).slice(0, 2) : resultsFor(hints, rand);
      rows.push({
        mode,
        dateKey,
        playerId: id,
        results,
        status: playing ? "playing" : lost ? "lost" : "won",
        hintsUsed: playing || lost ? null : hints,
        startedAt: new Date(startedAt),
        finishedAt: playing ? null : new Date(finishedAt),
      });
    }
  });

  // Real players get a history on past days they haven't touched, for streaks and the calendar.
  const real = await db
    .select({ id: players.id })
    .from(players)
    .where(notLike(players.tomomaiUserId, `${SEED_PREFIX}%`));
  for (const { id } of real) {
    for (let d = 1; d < days; d++) {
      if (d > 9 && rand() < 0.3) continue;
      const dateKey = shiftDateKey(today, -d);
      const startedAt = dayStart(dateKey).getTime() + (0.2 + rand() * 0.6) * DAY_MS;
      const hints = d === 12 ? 0 : 1 + Math.floor(rand() * (HINT_COUNT - 1));
      rows.push({
        mode,
        dateKey,
        playerId: id,
        results: resultsFor(hints, rand),
        status: hints ? "won" : "lost",
        hintsUsed: hints || null,
        startedAt: new Date(startedAt),
        finishedAt: new Date(startedAt + 30_000 + rand() * 180_000),
      });
    }
  }

  for (let i = 0; i < rows.length; i += 500) {
    await db.insert(attempts).values(rows.slice(i, i + 500)).onConflictDoNothing();
  }

  // Anonymous guests count toward each day's played and solved totals.
  for (let d = 0; d < days; d++) {
    const dateKey = shiftDateKey(today, -d);
    await db.execute(sql`
      insert into ${attempts} (mode, date_key, guest_id, results, status, hints_used, started_at, finished_at)
      select ${mode}, ${dateKey}, 'seedguest-' || g || '-' || ${dateKey}, '[]'::jsonb,
        case when random() < 0.4 then 'lost' else 'won' end, 1 + floor(random() * ${HINT_COUNT})::int,
        least(now(), ${dayStart(dateKey).toISOString()}::timestamptz + random() * interval '20 hours'),
        least(now(), ${dayStart(dateKey).toISOString()}::timestamptz + random() * interval '20 hours')
      from generate_series(1, 25) g
      on conflict do nothing
    `);
  }
  await db
    .update(attempts)
    .set({ hintsUsed: null })
    .where(and(eq(attempts.status, "lost"), isNotNull(attempts.guestId)));

  console.log(`seeded ${seeded.length} players and ${rows.length} attempts over ${days} days (${mode})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
