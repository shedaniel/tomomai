import { songInstanceId } from "@/lib/db/song-instance-id";
import { db } from '@/lib/db';
import { parentSong, songs, user, userRecentSongs, userRecentSongsDetailed, userSnapshots } from '@/lib/db/schema-pg';
import { and, asc, desc, eq, gte, lt, lte } from 'drizzle-orm';
import { VersionId } from '@/lib/metadata';
import { getLogger } from '@/lib/request-logger';
import { FullCombo, FullSync, Region, TitleType } from '@/lib/types';

// Type for detailed song statistics
export interface RecentSongDetails {
  fastCount: number;
  lateCount: number;
  combo: number;
  maxCombo: number;
  syncScore: number | null;
  maxSyncScore: number | null;
  rating: number;
  ratingChange: number;
  venue: string | null;
  // Note judgments
  tapCPerfect: number;
  tapPerfect: number;
  tapGreat: number;
  tapGood: number;
  tapMiss: number;
  holdCPerfect: number;
  holdPerfect: number;
  holdGreat: number;
  holdGood: number;
  holdMiss: number;
  slideCPerfect: number;
  slidePerfect: number;
  slideGreat: number;
  slideGood: number;
  slideMiss: number;
  touchCPerfect: number;
  touchPerfect: number;
  touchGreat: number;
  touchGood: number;
  touchMiss: number;
  breakCPerfect: number;
  breakPerfect: number;
  breakGreat: number;
  breakGood: number;
  breakMiss: number;
}

// Type for a recent song with all needed data
export interface RecentSongData {
  id: bigint;
  playedAt: Date;
  achievement: number;
  dxScore: number;
  maxDxScore: number;
  fc: FullCombo;
  fs: FullSync;
  track: number;
  songPublicId: string;
  songName: string;
  artist: string;
  cover: string;
  difficulty: string;
  level: string;
  levelPrecise: number;
  type: string;
  addedVersion: number;
  // Detailed stats (null if not available for this play)
  details: RecentSongDetails | null;
}

// Type for a credit (a group of tracks played together)
export interface CreditData {
  playedAt: Date;
  tracks: RecentSongData[];
}

// Type for snapshot metadata
export interface SnapshotMetadata {
  id: string;
  fetchedAt: Date;
  gameVersion: VersionId;
  rating: number;
  iconUrl: string;
  displayName: string;
  title: string;
  titleType: TitleType;
  courseRankUrl: string;
  classRankUrl: string;
  stars: number;
}

// Type for the prepared data result
export type CreditPrepareResult = {
  type: "success";
  credit: CreditData;
  snapshot: SnapshotMetadata;
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
    difficulty: string;
    achievement: number;
    fc: FullCombo;
    fs: FullSync;
  }[];
}

// Track numbers count down within a credit (4, 3, 2, 1), so a new credit starts
// whenever the next older row's track number isn't lower.
function groupIntoCredits<T extends { track: number }>(rowsNewestFirst: T[]): T[][] {
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

// Rows from startAt onwards, cut where the track numbers stop counting up
function takeCreditFrom<T extends { track: number; playedAt: Date }>(rowsOldestFirst: T[], startAt: Date): T[] {
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
  difficulty: parentSong.difficulty,
  achievement: userRecentSongs.archievement,
  fc: userRecentSongs.fc,
  fs: userRecentSongs.fs,
};

type SummaryRow = { playedAt: Date; track: number; songId: string; songName: string; cover: string; difficulty: string; achievement: number; fc: FullCombo; fs: FullSync };

function toSummary(rowsNewestFirst: SummaryRow[]): CreditSummary {
  const tracks = [...rowsNewestFirst].sort((a, b) => a.track - b.track);
  return {
    at: Math.floor(tracks[0].playedAt.getTime() / 1000),
    tracks: tracks.map(({ playedAt: _playedAt, ...rest }) => rest),
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
      eq(userRecentSongs.userId, userId),
      eq(songs.region, region),
      bound !== undefined ? lt(userRecentSongs.playedAt, new Date(bound * 1000)) : undefined,
    ))
    .orderBy(desc(userRecentSongs.playedAt))
    .limit(rowLimit);

  const grouped = groupIntoCredits(rows as SummaryRow[]);
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
    .where(and(eq(userRecentSongs.userId, userId), eq(songs.region, region), gte(userRecentSongs.playedAt, startAt)))
    .orderBy(asc(userRecentSongs.playedAt))
    .limit(4);
  const credit = takeCreditFrom(rows as SummaryRow[], startAt);
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
  const log = getLogger().child({ userId, region });
  log.debug('Fetching recent songs for credit...');
  let startTime = Date.now();

  // We need to fetch enough tracks to find the complete credit
  // A credit can have up to 4 tracks, so we fetch extra to:
  // 1. Find the current credit's tracks
  // 2. Check if there are more credits available
  const maxTracksToFetch = 8; // Current credit (4 max) + next credit (4 max)

  const fetchedPlays = await db
    .select({
      id: userRecentSongs.id,
      playedAt: userRecentSongs.playedAt,
      achievement: userRecentSongs.archievement, // Note: typo in schema
      dxScore: userRecentSongs.dxScore,
      maxDxScore: userRecentSongs.maxDxScore,
      fc: userRecentSongs.fc,
      fs: userRecentSongs.fs,
      track: userRecentSongs.track,
      songPublicId: songInstanceId,
      songName: parentSong.songName,
      artist: parentSong.artist,
      cover: parentSong.cover,
      difficulty: parentSong.difficulty,
      level: songs.level,
      levelPrecise: songs.levelPrecise,
      type: parentSong.type,
      addedVersion: songs.addedVersion,
      // Detailed stats from separate table (may be null)
      fastCount: userRecentSongsDetailed.fastCount,
      lateCount: userRecentSongsDetailed.lateCount,
      combo: userRecentSongsDetailed.combo,
      maxCombo: userRecentSongsDetailed.maxCombo,
      syncScore: userRecentSongsDetailed.syncScore,
      maxSyncScore: userRecentSongsDetailed.maxSyncScore,
      rating: userRecentSongsDetailed.rating,
      ratingChange: userRecentSongsDetailed.ratingChange,
      venue: userRecentSongsDetailed.venue,
      // Note judgments from separate table (may be null)
      tapCPerfect: userRecentSongsDetailed.tapCPerfect,
      tapPerfect: userRecentSongsDetailed.tapPerfect,
      tapGreat: userRecentSongsDetailed.tapGreat,
      tapGood: userRecentSongsDetailed.tapGood,
      tapMiss: userRecentSongsDetailed.tapMiss,
      holdCPerfect: userRecentSongsDetailed.holdCPerfect,
      holdPerfect: userRecentSongsDetailed.holdPerfect,
      holdGreat: userRecentSongsDetailed.holdGreat,
      holdGood: userRecentSongsDetailed.holdGood,
      holdMiss: userRecentSongsDetailed.holdMiss,
      slideCPerfect: userRecentSongsDetailed.slideCPerfect,
      slidePerfect: userRecentSongsDetailed.slidePerfect,
      slideGreat: userRecentSongsDetailed.slideGreat,
      slideGood: userRecentSongsDetailed.slideGood,
      slideMiss: userRecentSongsDetailed.slideMiss,
      touchCPerfect: userRecentSongsDetailed.touchCPerfect,
      touchPerfect: userRecentSongsDetailed.touchPerfect,
      touchGreat: userRecentSongsDetailed.touchGreat,
      touchGood: userRecentSongsDetailed.touchGood,
      touchMiss: userRecentSongsDetailed.touchMiss,
      breakCPerfect: userRecentSongsDetailed.breakCPerfect,
      breakPerfect: userRecentSongsDetailed.breakPerfect,
      breakGreat: userRecentSongsDetailed.breakGreat,
      breakGood: userRecentSongsDetailed.breakGood,
      breakMiss: userRecentSongsDetailed.breakMiss,
    })
    .from(userRecentSongs)
    .innerJoin(songs, eq(userRecentSongs.songId, songs.id))
    .innerJoin(parentSong, eq(songs.parentId, parentSong.id))
    .leftJoin(userRecentSongsDetailed, eq(userRecentSongs.id, userRecentSongsDetailed.recentSongId))
    .where(
      and(
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

  // Check if there's a next credit (more recent - only when using beforeDate)
  const hasNextCredit = beforeDate !== undefined || startAt !== undefined;
  // Check if there's a previous credit (older)
  const hasPreviousCredit = credits.length > 1;

  // Get user privacy settings and snapshot closest to (but not after) the credit date
  log.debug('Fetching user privacy settings and snapshot...');
  startTime = Date.now();

  const [userRecord, snapshotRecord] = await Promise.all([
    db
      .select({ username: user.username, publishProfile: user.publishProfile })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1),
    db
      .select({
        publicId: userSnapshots.publicId,
        fetchedAt: userSnapshots.fetchedAt,
        gameVersion: userSnapshots.gameVersion,
        rating: userSnapshots.rating,
        iconUrl: userSnapshots.iconUrl,
        displayName: userSnapshots.displayName,
        title: userSnapshots.title,
        titleType: userSnapshots.titleType,
        courseRankUrl: userSnapshots.courseRankUrl,
        classRankUrl: userSnapshots.classRankUrl,
        stars: userSnapshots.stars,
      })
      .from(userSnapshots)
      .where(and(
        eq(userSnapshots.userId, userId),
        eq(userSnapshots.region, region),
        // The fetch that imported the credit carries the rating right after it
        startAt
          ? gte(userSnapshots.fetchedAt, targetCredit[0].playedAt)
          : beforeDate ? lte(userSnapshots.fetchedAt, beforeDate) : undefined,
      ))
      .orderBy(startAt ? asc(userSnapshots.fetchedAt) : desc(userSnapshots.fetchedAt))
      .limit(1),
  ]);

  if (userRecord.length === 0) {
    log.warn('User not found');
    return {
      type: "error",
      error: 'User not found',
    };
  }

  if (snapshotRecord.length === 0) {
    log.warn('No snapshot found for this credit date');
    return {
      type: "error",
      error: 'No snapshot found for this credit date',
    };
  }

  const snapshot = snapshotRecord[0];
  log.debug({ durationMs: Date.now() - startTime }, 'User privacy settings and snapshot fetched');

  // Determine visitable profile URL
  const visitableProfileAt = userRecord[0].publishProfile && userRecord[0].username
    ? userRecord[0].username
    : null;

  const creditData: CreditData = {
    playedAt: creditPlayedAt,
    tracks: sortedCredit.map(track => {
      // Check if detailed stats are available (all required fields are non-null)
      const hasDetails = track.fastCount !== null &&
        track.lateCount !== null &&
        track.combo !== null &&
        track.maxCombo !== null &&
        track.rating !== null &&
        track.ratingChange !== null &&
        track.tapCPerfect !== null &&
        track.tapPerfect !== null &&
        track.tapGreat !== null &&
        track.tapGood !== null &&
        track.tapMiss !== null &&
        track.holdCPerfect !== null &&
        track.holdPerfect !== null &&
        track.holdGreat !== null &&
        track.holdGood !== null &&
        track.holdMiss !== null &&
        track.slideCPerfect !== null &&
        track.slidePerfect !== null &&
        track.slideGreat !== null &&
        track.slideGood !== null &&
        track.slideMiss !== null &&
        track.touchCPerfect !== null &&
        track.touchPerfect !== null &&
        track.touchGreat !== null &&
        track.touchGood !== null &&
        track.touchMiss !== null &&
        track.breakCPerfect !== null &&
        track.breakPerfect !== null &&
        track.breakGreat !== null &&
        track.breakGood !== null &&
        track.breakMiss !== null;

      return {
        id: track.id,
        playedAt: track.playedAt,
        achievement: track.achievement,
        dxScore: track.dxScore,
        maxDxScore: track.maxDxScore,
        fc: track.fc,
        fs: track.fs,
        track: track.track,
        songPublicId: track.songPublicId,
        songName: track.songName,
        artist: track.artist,
        cover: track.cover,
        difficulty: track.difficulty,
        level: track.level,
        levelPrecise: track.levelPrecise,
        type: track.type,
        addedVersion: track.addedVersion,
        details: hasDetails ? {
          fastCount: track.fastCount!,
          lateCount: track.lateCount!,
          combo: track.combo!,
          maxCombo: track.maxCombo!,
          syncScore: track.syncScore,
          maxSyncScore: track.maxSyncScore,
          rating: track.rating!,
          ratingChange: track.ratingChange!,
          venue: track.venue,
          tapCPerfect: track.tapCPerfect!,
          tapPerfect: track.tapPerfect!,
          tapGreat: track.tapGreat!,
          tapGood: track.tapGood!,
          tapMiss: track.tapMiss!,
          holdCPerfect: track.holdCPerfect!,
          holdPerfect: track.holdPerfect!,
          holdGreat: track.holdGreat!,
          holdGood: track.holdGood!,
          holdMiss: track.holdMiss!,
          slideCPerfect: track.slideCPerfect!,
          slidePerfect: track.slidePerfect!,
          slideGreat: track.slideGreat!,
          slideGood: track.slideGood!,
          slideMiss: track.slideMiss!,
          touchCPerfect: track.touchCPerfect!,
          touchPerfect: track.touchPerfect!,
          touchGreat: track.touchGreat!,
          touchGood: track.touchGood!,
          touchMiss: track.touchMiss!,
          breakCPerfect: track.breakCPerfect!,
          breakPerfect: track.breakPerfect!,
          breakGreat: track.breakGreat!,
          breakGood: track.breakGood!,
          breakMiss: track.breakMiss!,
        } : null,
      };
    }),
  };

  const snapshotMetadata: SnapshotMetadata = {
    id: snapshot.publicId,
    fetchedAt: snapshot.fetchedAt,
    gameVersion: snapshot.gameVersion as VersionId,
    rating: snapshot.rating,
    iconUrl: snapshot.iconUrl,
    displayName: snapshot.displayName,
    title: snapshot.title,
    titleType: snapshot.titleType,
    courseRankUrl: snapshot.courseRankUrl,
    classRankUrl: snapshot.classRankUrl,
    stars: snapshot.stars,
  };

  return {
    type: "success",
    credit: creditData,
    snapshot: snapshotMetadata,
    visitableProfileAt,
    hasNextCredit,
    hasPreviousCredit,
  };
}
