import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { StepResult } from "../progress";
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

/** A tomomai account that has signed into the guesser via OAuth. */
export const players = pgTable("players", {
  id: uuid("id").primaryKey().defaultRandom(),
  tomomaiUserId: text("tomomai_user_id").notNull().unique(),
  username: text("username"),
  image: text("image"),
  showOnLeaderboard: boolean("show_on_leaderboard").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PlayerRow = typeof players.$inferSelect;

export const playerSessions = pgTable(
  "player_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("player_sessions_player_idx").on(t.playerId)],
);

export type AttemptStatus = "playing" | "won" | "lost";

/**
 * Server-recorded play of one daily puzzle, owned by a player or, before
 * sign-in, by an anonymous guest cookie. Guest rows move to the player on
 * sign-in so results earned before logging in keep their real timestamps.
 */
export const attempts = pgTable(
  "attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mode: text("mode").notNull(),
    dateKey: text("date_key").notNull(),
    playerId: uuid("player_id").references(() => players.id, { onDelete: "cascade" }),
    guestId: text("guest_id"),
    results: jsonb("results").$type<StepResult[]>().notNull().default(sql`'[]'::jsonb`),
    status: text("status").$type<AttemptStatus>().notNull().default("playing"),
    /** Hints revealed when the puzzle was solved; null until won. */
    hintsUsed: integer("hints_used"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("attempts_player_day_idx").on(t.mode, t.dateKey, t.playerId),
    uniqueIndex("attempts_guest_day_idx").on(t.mode, t.dateKey, t.guestId),
    index("attempts_board_idx").on(t.mode, t.dateKey, t.status, t.hintsUsed, t.finishedAt),
  ],
);

export type AttemptRow = typeof attempts.$inferSelect;
