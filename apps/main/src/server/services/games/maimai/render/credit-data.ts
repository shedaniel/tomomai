import "server-only";
import { db } from '@/lib/db';
import { parentSong, songs, user, userRecentSongs, maimaiRecentSongDetails } from '@/lib/db/schema-pg';
import { and, asc, desc, eq, gte, lt, lte, sql } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import type { Region } from '@/lib/games/ids';
import type { GamePlayerScore, GameSnapshot } from '@/lib/games/player-view';
import { latestSnapshot } from '@/server/queries/latest-snapshot';
import { songInstanceId } from '@/lib/db/song-instance-id';
import { gameSnapshotColumns } from '@/server/queries/snapshots';
import type { MaimaiPlaylog } from '@/lib/games/maimai/recent-details';
import { maimaiRecentPlayColumns } from '../columns';
import { maimaiPlaylogColumns, toMaimaiPlaylog } from '../recent-details';

export type CreditTrack = Pick<GamePlayerScore, "songId" | "scoreValue" | "secondaryScore" | "comboStatus" | "syncStatus"> & {
  playedAt: Date;
  maxDxScore: number;
  track: number;
  playlog: MaimaiPlaylog | null;
};

// Type for a credit (a group of tracks played together)
export interface CreditData {
  playedAt: Date;
  tracks: CreditTrack[];
}

// Type for the prepared data result
export type CreditPrepareResult = {
  type: "success";
  credit: CreditData;
  snapshot: GameSnapshot;
  visitableProfileAt: string | null;
  hasNextCredit: boolean;
  hasPreviousCredit: boolean;
} | {
  type: "error";
  error: string;
}

/** A credit is identified by the time its lowest-numbered track was played. */
export interface CreditSummary {
  /** Unix seconds of the credit's first track. */
  at: number;
  tracks: {
    track: number;
    songId: string;
    songName: string;
    cover: string;
    difficultyCode: number;
  }[];
}

// Track numbers count down within a credit (4, 3, 2, 1), so a new credit starts
// whenever the next older row's track number isn't lower.
export function groupIntoCredits<T extends { track: number }>(rowsNewestFirst: T[]): T[][] {
  const credits: T[][] = [];
  let current: T[] = [];
  for (let i = 0; i < rowsNewestFirst.length; i++) {
    current.push(rowsNewestFirst[i]);
    if (i === rowsNewestFirst.length - 1 || rowsNewestFirst[i + 1].track >= rowsNewestFirst[i].track) {
      credits.push(current);
      current = [];
    }
  }
  return credits;
}

/** The credit whose first track was played at `startAt`, newest first, or none when no play starts there. */
export function takeCreditFrom<T extends { track: number; playedAt: Date }>(rowsOldestFirst: T[], startAt: Date): T[] {
  if (rowsOldestFirst.length === 0 || rowsOldestFirst[0].playedAt.getTime() !== startAt.getTime()) return [];
  const credit = [rowsOldestFirst[0]];
  for (let i = 1; i < rowsOldestFirst.length && rowsOldestFirst[i].track > rowsOldestFirst[i - 1].track; i++) {
    credit.push(rowsOldestFirst[i]);
  }
  return credit.reverse();
}

const summaryColumns = {
  playedAt: userRecentSongs.playedAt,
  track: userRecentSongs.track,
  songId: songInstanceId,
  songName: parentSong.songName,
  cover: parentSong.cover,
  difficultyCode: parentSong.difficulty,
};

type SummaryRow = CreditSummary["tracks"][number] & { playedAt: Date };

function toSummary(rows: SummaryRow[]): CreditSummary {
  const tracks = [...rows].sort((a, b) => a.track - b.track);
  return {
    at: Math.floor(tracks[0].playedAt.getTime() / 1000),
    tracks: tracks.map(({ playedAt: _playedAt, ...track }) => track),
  };
}

/**
 * Newest-first page of credits started before `before`. `cursor` is the `at`
 * of the last credit on the previous page.
 */
export async function listCreditSummaries(
  userId: string,
  region: Region,
  opts: { before?: number; cursor?: number; limit: number },
): Promise<{ credits: CreditSummary[]; nextCursor: number | null }> {
  const rowLimit = opts.limit * 4 + 4;
  const bound = opts.cursor ?? opts.before;
  const rows = await db
    .select(summaryColumns)
    .from(userRecentSongs)
    .innerJoin(songs, eq(userRecentSongs.songId, songs.id))
    .innerJoin(parentSong, eq(songs.parentId, parentSong.id))
    .where(and(
      eq(userRecentSongs.game, "maimai"),
      eq(userRecentSongs.userId, userId),
      eq(songs.region, region),
      bound !== undefined ? lt(userRecentSongs.playedAt, new Date(bound * 1000)) : undefined,
    ))
    .orderBy(desc(userRecentSongs.playedAt))
    .limit(rowLimit);

  const grouped = groupIntoCredits(rows);
  const exhausted = rows.length < rowLimit;
  // The oldest group may be cut off mid-credit by the row limit
  const complete = exhausted ? grouped : grouped.slice(0, -1);
  const page = complete.slice(0, opts.limit).map(toSummary);
  const hasMore = complete.length > opts.limit || !exhausted;
  return { credits: page, nextCursor: hasMore && page.length > 0 ? page[page.length - 1].at : null };
}

export async function findCreditSummary(userId: string, region: Region, at: number): Promise<CreditSummary | null> {
  const startAt = new Date(at * 1000);
  const rows = await db
    .select(summaryColumns)
    .from(userRecentSongs)
    .innerJoin(songs, eq(userRecentSongs.songId, songs.id))
    .innerJoin(parentSong, eq(songs.parentId, parentSong.id))
    .where(and(
      eq(userRecentSongs.game, "maimai"),
      eq(userRecentSongs.userId, userId),
      eq(songs.region, region),
      gte(userRecentSongs.playedAt, startAt),
    ))
    .orderBy(asc(userRecentSongs.playedAt))
    .limit(4);
  const credit = takeCreditFrom(rows, startAt);
  return credit.length > 0 ? toSummary(credit) : null;
}

/**
 * Loads one credit for rendering. With `startAt` it is the credit whose first
 * track was played at that time, otherwise the latest one at or before `beforeDate`.
 */
export async function prepareCreditData(
  userId: string,
  region: Region,
  beforeDate?: Date,
  startAt?: Date,
): Promise<CreditPrepareResult> {
  const log = logger.child({ userId, region });
  log.debug('Fetching recent songs for credit...');
  let startTime = Date.now();

  // We need to fetch enough tracks to find the complete credit
  // A credit can have up to 4 tracks, so we fetch extra to:
  // 1. Find the current credit's tracks
  // 2. Check if there are more credits available
  const maxTracksToFetch = 8; // Current credit (4 max) + next credit (4 max)

  const fetchedPlays = await db
    .select({
      ...maimaiRecentPlayColumns,
      maxDxScore: sql<number>`coalesce(${userRecentSongs.maxSecondaryScore}, 0)`.mapWith(Number).as("maxDxScore"),
      track: userRecentSongs.track,
      playlog: maimaiPlaylogColumns,
    })
    .from(userRecentSongs)
    .innerJoin(songs, eq(userRecentSongs.songId, songs.id))
    .innerJoin(parentSong, eq(songs.parentId, parentSong.id))
    .leftJoin(maimaiRecentSongDetails, eq(userRecentSongs.id, maimaiRecentSongDetails.recentSongId))
    .where(
      and(
        eq(userRecentSongs.game, "maimai"),
        eq(userRecentSongs.userId, userId),
        eq(songs.region, region),
        startAt
          ? gte(userRecentSongs.playedAt, startAt)
          : beforeDate ? lte(userRecentSongs.playedAt, beforeDate) : undefined
      )
    )
    .orderBy(startAt ? asc(userRecentSongs.playedAt) : desc(userRecentSongs.playedAt))
    .limit(startAt ? 4 : maxTracksToFetch);

  const recentPlays = startAt ? takeCreditFrom(fetchedPlays, startAt) : fetchedPlays;

  if (recentPlays.length === 0) {
    log.warn('No recent plays found');
    return {
      type: "error",
      error: 'No recent plays found',
    };
  }
  log.debug({ count: recentPlays.length, durationMs: Date.now() - startTime }, 'Fetched recent plays');

  const credits = groupIntoCredits(recentPlays);

  if (credits.length === 0) {
    log.warn('No credits found');
    return {
      type: "error",
      error: 'No credits found',
    };
  }

  // The first credit is the most recent one (or the one before beforeDate)
  const targetCredit = credits[0];
  // Use track 1's playedAt as the credit time (the first track played)
  // Sort to find the track with the lowest track number
  const sortedCredit = [...targetCredit].sort((a, b) => a.track - b.track);
  const creditPlayedAt = sortedCredit[0].playedAt;

  // Check if there's a next credit (more recent - only when using beforeDate or startAt)
  const hasNextCredit = beforeDate !== undefined || startAt !== undefined;
  // Check if there's a previous credit (older)
  const hasPreviousCredit = credits.length > 1;

  // Get user privacy settings and snapshot closest to (but not after) the credit date
  log.debug('Fetching user privacy settings and snapshot...');
  startTime = Date.now();

  const [userRecord, snapshot] = await Promise.all([
    db
      .select({ username: user.username, publishProfile: user.publishProfile })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1),
    // The fetch that imported a picked credit carries the rating right after it
    latestSnapshot("maimai", userId, region, gameSnapshotColumns, startAt ? { firstAfter: targetCredit[0].playedAt } : { asOf: beforeDate }),
  ]);

  if (userRecord.length === 0) {
    log.warn('User not found');
    return {
      type: "error",
      error: 'User not found',
    };
  }

  if (!snapshot) {
    log.warn('No snapshot found for this credit date');
    return {
      type: "error",
      error: 'No snapshot found for this credit date',
    };
  }

  log.debug({ durationMs: Date.now() - startTime }, 'User privacy settings and snapshot fetched');

  // Determine visitable profile URL
  const visitableProfileAt = userRecord[0].publishProfile && userRecord[0].username
    ? userRecord[0].username
    : null;

  const creditData: CreditData = {
    playedAt: creditPlayedAt,
    tracks: sortedCredit.map(track => ({
      songId: track.songId,
      playedAt: track.playedAt,
      scoreValue: track.scoreValue,
      secondaryScore: track.secondaryScore,
      maxDxScore: track.maxDxScore,
      comboStatus: track.comboStatus,
      syncStatus: track.syncStatus,
      track: track.track,
      playlog: track.playlog && toMaimaiPlaylog(track.playlog),
    })),
  };

  return {
    type: "success",
    credit: creditData,
    snapshot,
    visitableProfileAt,
    hasNextCredit,
    hasPreviousCredit,
  };
}
