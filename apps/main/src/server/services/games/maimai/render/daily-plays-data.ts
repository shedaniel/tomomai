import "server-only";
import { db } from '@/lib/db';
import { parentSong, songs, user, userRecentSongs } from '@/lib/db/schema-pg';
import { and, desc, eq, gte, lt } from 'drizzle-orm';
import type { Region } from '@/lib/types';
import type { GamePlayerScore, GameSnapshot } from '@/lib/games/player-view';
import { latestSnapshot } from '@/server/queries/latest-snapshot';
import { gameSnapshotColumns } from '@/server/queries/snapshots';
import { maimaiRecentPlayColumns } from '../columns';

/**
 * A "play day" runs from 07:00 JST to the next day 04:00 JST. Plays between
 * 04:00 and 07:00 JST belong to no day (arcade-closed gap).
 *
 * Day strings are ISO-style "YYYY-MM-DD" and refer to the JST date of the
 * 07:00 boundary that opens the day.
 */

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

function jstParts(d: Date): { y: number; m: number; d: number; h: number } {
  const shifted = new Date(d.getTime() + JST_OFFSET_MS);
  return {
    y: shifted.getUTCFullYear(),
    m: shifted.getUTCMonth() + 1,
    d: shifted.getUTCDate(),
    h: shifted.getUTCHours(),
  };
}

export function playedAtToDay(playedAt: Date): string | null {
  const { y, m, d, h } = jstParts(playedAt);
  if (h >= 7) {
    return `${y}-${pad(m)}-${pad(d)}`;
  }
  if (h < 4) {
    const prev = new Date(Date.UTC(y, m - 1, d) - 24 * 60 * 60 * 1000);
    return `${prev.getUTCFullYear()}-${pad(prev.getUTCMonth() + 1)}-${pad(prev.getUTCDate())}`;
  }
  return null;
}

export function isValidDayString(day: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(day);
}

export function dayBounds(day: string): { start: Date; end: Date } {
  const [y, m, d] = day.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, d, 7) - JST_OFFSET_MS);
  const end = new Date(Date.UTC(y, m - 1, d + 1, 4) - JST_OFFSET_MS);
  return { start, end };
}

export type DailyPlay = Pick<GamePlayerScore, "songId" | "scoreValue" | "secondaryScore" | "comboStatus" | "syncStatus"> & { playedAt: Date };

export type DailyPlaysPrepareResult =
  | {
    type: "success";
    day: string;
    plays: DailyPlay[];
    snapshot: GameSnapshot;
    visitableProfileAt: string | null;
  }
  | { type: "error"; error: string };

export async function prepareDailyPlaysData(
  userId: string,
  region: Region,
  requestedDay: string | undefined,
): Promise<DailyPlaysPrepareResult> {
  let day = requestedDay;

  if (!day) {
    const latest = await db
      .select({ playedAt: userRecentSongs.playedAt })
      .from(userRecentSongs)
      .innerJoin(songs, eq(userRecentSongs.songId, songs.id))
      .where(and(
        eq(userRecentSongs.game, "maimai"),
        eq(userRecentSongs.userId, userId),
        eq(songs.region, region),
      ))
      .orderBy(desc(userRecentSongs.playedAt))
      .limit(50);

    const found = latest.map(r => playedAtToDay(r.playedAt)).find((d): d is string => d !== null);
    if (!found) {
      return { type: "error", error: "No recent plays found" };
    }
    day = found;
  } else if (!isValidDayString(day)) {
    return { type: "error", error: "Invalid day format (expected YYYY-MM-DD)" };
  }

  const { start, end } = dayBounds(day);

  const plays: DailyPlay[] = await db
    .select(maimaiRecentPlayColumns)
    .from(userRecentSongs)
    .innerJoin(songs, eq(userRecentSongs.songId, songs.id))
    .innerJoin(parentSong, eq(songs.parentId, parentSong.id))
    .where(and(
      eq(userRecentSongs.game, "maimai"),
      eq(userRecentSongs.userId, userId),
      eq(songs.region, region),
      gte(userRecentSongs.playedAt, start),
      lt(userRecentSongs.playedAt, end),
    ))
    .orderBy(desc(userRecentSongs.playedAt))
    .limit(50);

  // The header shows the player as of the end of that day.
  const snapshot = await latestSnapshot("maimai", userId, region, gameSnapshotColumns, { asOf: end });

  if (!snapshot) {
    return { type: "error", error: "No snapshot found for this day" };
  }

  const userRow = await db
    .select({ username: user.username, publishProfile: user.publishProfile })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (userRow.length === 0) {
    return { type: "error", error: "User not found" };
  }

  if (plays.length === 0) {
    return { type: "error", error: "No plays for this day" };
  }

  return {
    type: "success",
    day,
    plays,
    snapshot,
    visitableProfileAt: userRow[0].publishProfile && userRow[0].username ? userRow[0].username : null,
  };
}

export interface DailyPlaysAvailableDay {
  day: string;
  count: number;
}

/**
 * Returns every JST play-day that has at least one play, newest first.
 */
export async function listDailyPlaysAvailableDays(
  userId: string,
  region: Region,
): Promise<DailyPlaysAvailableDay[]> {
  const rows = await db
    .select({ playedAt: userRecentSongs.playedAt })
    .from(userRecentSongs)
    .innerJoin(songs, eq(userRecentSongs.songId, songs.id))
    .where(and(
      eq(userRecentSongs.game, "maimai"),
      eq(userRecentSongs.userId, userId),
      eq(songs.region, region),
    ))
    .orderBy(desc(userRecentSongs.playedAt));

  const counts = new Map<string, number>();
  for (const { playedAt } of rows) {
    const day = playedAtToDay(playedAt);
    if (!day) continue;
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([day, count]) => ({ day, count }))
    .sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
}
