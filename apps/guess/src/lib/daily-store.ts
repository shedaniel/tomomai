import { and, eq } from "drizzle-orm";
import { getRealTodayKey } from "./date-slug";
import { getDb } from "./db";
import { dailyPuzzles } from "./db/schema";
import { getMode } from "./heardle-config";
import { logger } from "./logger";
import type { Chart, Hint } from "./types";

export type DailyPuzzle = { chart: Chart; plan: Hint[] };

const log = logger.child({ context: "daily-store" });

// Frozen rows never change, so they can be memoized for the process lifetime.
const memo = new Map<string, DailyPuzzle>();

function isFreezable(dateKey: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateKey) && dateKey <= getRealTodayKey();
}

/**
 * Returns the puzzle pinned for `dateKey`, freezing `compute()`'s result on
 * first access. Falls back to the live computation (without memoizing) when
 * Postgres is unset or unreachable, and for debug or future keys.
 */
export async function getFrozenDaily(
  dateKey: string,
  compute: () => Promise<DailyPuzzle>,
): Promise<DailyPuzzle> {
  const db = getDb();
  if (!db || !isFreezable(dateKey)) return compute();

  const mode = getMode();
  const memoKey = `${mode}:${dateKey}`;
  const hit = memo.get(memoKey);
  if (hit) return hit;

  const columns = { chart: dailyPuzzles.chart, plan: dailyPuzzles.plan };
  const where = and(eq(dailyPuzzles.mode, mode), eq(dailyPuzzles.dateKey, dateKey));

  let stored: DailyPuzzle | undefined;
  try {
    [stored] = await db.select(columns).from(dailyPuzzles).where(where).limit(1);
  } catch (err) {
    log.warn({ err, dateKey }, "failed to read frozen puzzle, computing live");
    return compute();
  }

  if (!stored) {
    const computed = await compute();
    try {
      [stored] = await db
        .insert(dailyPuzzles)
        .values({ mode, dateKey, ...computed })
        .onConflictDoNothing()
        .returning(columns);
      if (stored) {
        log.info({ dateKey }, "froze daily puzzle");
      } else {
        // Another instance froze it first; its row wins.
        [stored] = await db.select(columns).from(dailyPuzzles).where(where).limit(1);
      }
    } catch (err) {
      log.warn({ err, dateKey }, "failed to freeze puzzle, serving live computation");
      return computed;
    }
    if (!stored) return computed;
  }

  memo.set(memoKey, stored);
  return stored;
}
