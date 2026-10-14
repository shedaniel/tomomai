/**
 * Freezes every daily puzzle from --from through JST today using the current
 * song pool. Run once per deployment (guess and heardle) with that
 * deployment's env, before the catalogue next changes:
 *
 *   pnpm --filter @tomomai/guess backfill:daily --from 2026-05-01
 */
import { parseArgs } from "node:util";
import { and, between, count, eq } from "drizzle-orm";
import { getRealTodayKey } from "../src/lib/date-slug";
import { closeDb, getDb } from "../src/lib/db";
import { dailyPuzzles } from "../src/lib/db/schema";
import { getMode } from "../src/lib/heardle-config";
import { logger } from "../src/lib/logger";
import { getToday } from "../src/lib/today";

const log = logger.child({ context: "backfill-daily" });

function nextDateKey(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const { values } = parseArgs({ options: { from: { type: "string" } } });
  const from = values.from;
  if (!from || !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
    throw new Error("Usage: backfill:daily --from YYYY-MM-DD");
  }
  const db = getDb();
  if (!db) throw new Error("POSTGRES_URL is not set");
  if (process.env.DEBUG_KEY) throw new Error("Unset DEBUG_KEY before backfilling");

  const mode = getMode();
  const today = getRealTodayKey();
  let expected = 0;
  for (let dateKey = from; dateKey <= today; dateKey = nextDateKey(dateKey)) {
    await getToday(dateKey);
    expected++;
  }

  // getToday serves live computations when a write fails, so verify every day landed.
  const [{ frozen }] = await db
    .select({ frozen: count() })
    .from(dailyPuzzles)
    .where(and(eq(dailyPuzzles.mode, mode), between(dailyPuzzles.dateKey, from, today)));
  if (frozen !== expected) {
    throw new Error(`Only ${frozen} of ${expected} days are frozen; see warnings above`);
  }
  log.info({ count: expected, from, to: today, mode }, "backfill complete");
}

main()
  .catch((err) => {
    log.error({ err }, "backfill failed");
    process.exitCode = 1;
  })
  .finally(() => closeDb());
