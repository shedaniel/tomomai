import { and, desc, eq, gte, ne, sql } from "drizzle-orm";
import { tomomaiProfileUrl } from "./accounts/config";
import { getRealTodayKey } from "./date-slug";
import { dayEnd, isLate, msSinceDayStart, shiftDateKey, visibleUntil } from "./day";
import { getDb } from "./db";
import { attempts } from "./db/schema";
import { getMode } from "./heardle-config";
import { HINT_COUNT } from "./types";
import { displayName } from "./viewer";

const BOARD_SIZE = 100;
export const CALENDAR_DAYS = 140;

export type BoardEntry = {
  rank: number;
  /** Null when the player hides their name from public boards. */
  name: string | null;
  profileUrl: string | null;
  image: string | null;
  hintsUsed: number;
  msSinceStart: number;
  late: boolean;
  isViewer: boolean;
};

export type DayStats = {
  played: number;
  solved: number;
  /** Index i = solves that needed i + 1 hints. */
  distribution: number[];
};

export type Leaderboard = {
  dateKey: string;
  entries: BoardEntry[];
  rankedCount: number;
  viewer: BoardEntry | null;
  stats: DayStats;
};

export async function getLeaderboard(
  dateKey: string,
  viewerPlayerId: string | null,
): Promise<Leaderboard | null> {
  const db = getDb();
  if (!db) return null;
  const mode = getMode();
  const end = dayEnd(dateKey).toISOString();
  const cutoff = visibleUntil(dateKey).toISOString();

  const ranked = await db.execute<{
    player_id: string;
    username: string | null;
    image: string | null;
    show_on_leaderboard: boolean;
    hints_used: number;
    finished_at: string;
    rank: string;
    total: string;
  }>(sql`
    with ranked as (
      select a.player_id, p.username, p.image, p.show_on_leaderboard, a.hints_used, a.finished_at,
        row_number() over (
          order by (a.finished_at >= ${end}::timestamptz), a.hints_used, a.finished_at
        ) as rank,
        count(*) over () as total
      from ${attempts} a
      join players p on p.id = a.player_id
      where a.mode = ${mode} and a.date_key = ${dateKey} and a.status = 'won'
        and a.finished_at < ${cutoff}::timestamptz
    )
    select * from ranked
    where rank <= ${BOARD_SIZE} or player_id = ${viewerPlayerId ?? null}::uuid
    order by rank
  `);

  const toEntry = (r: (typeof ranked)[number]): BoardEntry => {
    const finishedAt = new Date(r.finished_at);
    const isViewer = r.player_id === viewerPlayerId;
    const visible = r.show_on_leaderboard || isViewer;
    return {
      rank: Number(r.rank),
      name: visible ? displayName(r.username, r.player_id) : null,
      profileUrl: visible && r.username ? tomomaiProfileUrl(r.username) : null,
      image: visible ? r.image : null,
      hintsUsed: r.hints_used,
      msSinceStart: msSinceDayStart(dateKey, finishedAt),
      late: isLate(dateKey, finishedAt),
      isViewer,
    };
  };

  const all = ranked.map(toEntry);
  const entries = all.filter((e) => e.rank <= BOARD_SIZE);
  const viewer = all.find((e) => e.isViewer) ?? null;

  const statRows = await db
    .select({
      status: attempts.status,
      hintsUsed: attempts.hintsUsed,
      count: sql<number>`count(*)::int`,
    })
    .from(attempts)
    .where(and(eq(attempts.mode, mode), eq(attempts.dateKey, dateKey), ne(attempts.status, "playing")))
    .groupBy(attempts.status, attempts.hintsUsed);

  const distribution = Array.from({ length: HINT_COUNT }, () => 0);
  let played = 0;
  let solved = 0;
  for (const row of statRows) {
    played += row.count;
    if (row.status === "won" && row.hintsUsed) {
      solved += row.count;
      const i = Math.min(row.hintsUsed, HINT_COUNT) - 1;
      distribution[i]! += row.count;
    }
  }

  return {
    dateKey,
    entries,
    rankedCount: ranked.length ? Number(ranked[0]!.total) : 0,
    viewer,
    stats: { played, solved, distribution },
  };
}

export type CalendarDay = {
  dateKey: string;
  status: "won" | "lost" | "playing" | null;
  hintsUsed: number | null;
  late: boolean;
};

export type PlayerStats = {
  played: number;
  wins: number;
  currentStreak: number;
  bestStreak: number;
  /** Index i = wins with i + 1 hints; the final slot counts losses. */
  distribution: number[];
  averageHints: number | null;
  earliestSolveMs: number | null;
  medianSolveMs: number | null;
  todayKey: string;
  calendar: CalendarDay[];
};

/** Consecutive on-time wins ending today, or yesterday while today is still open. */
function countStreak(onTimeWins: Set<string>, todayKey: string): number {
  let streak = 0;
  let cursor = onTimeWins.has(todayKey) ? todayKey : shiftDateKey(todayKey, -1);
  while (onTimeWins.has(cursor)) {
    streak++;
    cursor = shiftDateKey(cursor, -1);
  }
  return streak;
}

export type Streak = { current: number; solvedToday: boolean };

export async function getStreak(playerId: string): Promise<Streak | null> {
  const db = getDb();
  if (!db) return null;
  const todayKey = getRealTodayKey();
  const rows = await db
    .select({ dateKey: attempts.dateKey, finishedAt: attempts.finishedAt })
    .from(attempts)
    .where(
      and(
        eq(attempts.mode, getMode()),
        eq(attempts.playerId, playerId),
        eq(attempts.status, "won"),
        gte(attempts.dateKey, shiftDateKey(todayKey, -400)),
      ),
    );
  const onTimeWins = new Set(
    rows.filter((r) => r.finishedAt && !isLate(r.dateKey, r.finishedAt)).map((r) => r.dateKey),
  );
  return { current: countStreak(onTimeWins, todayKey), solvedToday: onTimeWins.has(todayKey) };
}

/** Streaks count consecutive days solved on the day itself. */
export async function getPlayerStats(playerId: string): Promise<PlayerStats | null> {
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select({
      dateKey: attempts.dateKey,
      status: attempts.status,
      hintsUsed: attempts.hintsUsed,
      startedAt: attempts.startedAt,
      finishedAt: attempts.finishedAt,
    })
    .from(attempts)
    .where(and(eq(attempts.mode, getMode()), eq(attempts.playerId, playerId)))
    .orderBy(desc(attempts.dateKey));

  const todayKey = getRealTodayKey();
  const onTimeWins = new Set<string>();
  const distribution = Array.from({ length: HINT_COUNT + 1 }, () => 0);
  const solveDurations: number[] = [];
  let played = 0;
  let wins = 0;
  let hintTotal = 0;
  let earliestSolveMs: number | null = null;

  for (const r of rows) {
    if (r.status === "playing") continue;
    played++;
    if (r.status === "lost" || !r.hintsUsed || !r.finishedAt) {
      distribution[HINT_COUNT]!++;
      continue;
    }
    wins++;
    hintTotal += r.hintsUsed;
    distribution[Math.min(r.hintsUsed, HINT_COUNT) - 1]!++;
    // Results imported from local progress have no real start time.
    const duration = r.finishedAt.getTime() - r.startedAt.getTime();
    if (duration > 0) solveDurations.push(duration);
    if (!isLate(r.dateKey, r.finishedAt)) {
      onTimeWins.add(r.dateKey);
      const ms = msSinceDayStart(r.dateKey, r.finishedAt);
      if (earliestSolveMs === null || ms < earliestSolveMs) earliestSolveMs = ms;
    }
  }

  const currentStreak = countStreak(onTimeWins, todayKey);

  let bestStreak = 0;
  let run = 0;
  let prev: string | null = null;
  for (const key of [...onTimeWins].sort()) {
    run = prev && shiftDateKey(prev, 1) === key ? run + 1 : 1;
    bestStreak = Math.max(bestStreak, run);
    prev = key;
  }

  solveDurations.sort((a, b) => a - b);
  const medianSolveMs = solveDurations.length
    ? solveDurations[Math.floor(solveDurations.length / 2)]!
    : null;

  const byDay = new Map(rows.map((r) => [r.dateKey, r]));
  const calendar: CalendarDay[] = [];
  for (let i = CALENDAR_DAYS - 1; i >= 0; i--) {
    const key = shiftDateKey(todayKey, -i);
    const r = byDay.get(key);
    calendar.push({
      dateKey: key,
      status: r?.status ?? null,
      hintsUsed: r?.hintsUsed ?? null,
      late: Boolean(r?.finishedAt && isLate(key, r.finishedAt)),
    });
  }

  return {
    played,
    wins,
    currentStreak,
    bestStreak,
    distribution,
    averageHints: wins ? hintTotal / wins : null,
    earliestSolveMs,
    medianSolveMs,
    todayKey,
    calendar,
  };
}
