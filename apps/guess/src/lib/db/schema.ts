import { jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import type { Chart, Hint } from "../types";

/**
 * Frozen daily puzzles. Selection is a pure function of (secret, dateKey,
 * pool), so any catalogue change would reshuffle past days — the first
 * computation for each (mode, dateKey) is pinned here instead. `chart` is a
 * full snapshot because the live catalogue only carries the current version.
 */
export const dailyPuzzles = pgTable(
  "daily_puzzles",
  {
    mode: text("mode").notNull(),
    dateKey: text("date_key").notNull(),
    chart: jsonb("chart").$type<Chart>().notNull(),
    plan: jsonb("plan").$type<Hint[]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.mode, t.dateKey] })],
);

export type DailyPuzzleRow = typeof dailyPuzzles.$inferSelect;
