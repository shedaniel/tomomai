import "server-only";
import { db } from '@/lib/db';
import { parentSong, songs, user, userRecentSongs, maimaiRecentSongDetails, userSnapshots } from '@/lib/db/schema-pg';
import { and, desc, eq, lte, sql } from 'drizzle-orm';
import { getLogger } from '@/lib/request-logger';
import type { Region } from '@/lib/types';
import type { GamePlayerScore, GameSnapshot } from '@/lib/games/player-view';
import { gameSnapshotColumns } from '@/server/queries/snapshots';
import { maimaiRecentPlayColumns } from '../columns';

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

export type CreditTrack = Pick<GamePlayerScore, "songId" | "scoreValue" | "secondaryScore" | "comboStatus" | "syncStatus"> & {
  playedAt: Date;
  maxDxScore: number;
  track: number;
  // Detailed stats (null if not available for this play)
  details: RecentSongDetails | null;
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

export async function prepareCreditData(
  userId: string,
  region: Region,
  beforeDate?: Date
): Promise<CreditPrepareResult> {
  const log = getLogger().child({ userId, region });
  log.debug('Fetching recent songs for credit...');
  let startTime = Date.now();

  // We need to fetch enough tracks to find the complete credit
  // A credit can have up to 4 tracks, so we fetch extra to:
  // 1. Find the current credit's tracks
  // 2. Check if there are more credits available
  const maxTracksToFetch = 8; // Current credit (4 max) + next credit (4 max)

  const recentPlays = await db
    .select({
      ...maimaiRecentPlayColumns,
      maxDxScore: sql<number>`coalesce(${userRecentSongs.maxDxScore}, 0)`.mapWith(Number).as("maxDxScore"),
      track: sql<number>`coalesce(${userRecentSongs.track}, 0)`.mapWith(Number).as("track"),
      // Detailed stats from separate table (may be null)
      fastCount: maimaiRecentSongDetails.fastCount,
      lateCount: maimaiRecentSongDetails.lateCount,
      combo: maimaiRecentSongDetails.combo,
      maxCombo: maimaiRecentSongDetails.maxCombo,
      syncScore: maimaiRecentSongDetails.syncScore,
      maxSyncScore: maimaiRecentSongDetails.maxSyncScore,
      rating: maimaiRecentSongDetails.rating,
      ratingChange: maimaiRecentSongDetails.ratingChange,
      venue: maimaiRecentSongDetails.venue,
      // Note judgments from separate table (may be null)
      tapCPerfect: maimaiRecentSongDetails.tapCPerfect,
      tapPerfect: maimaiRecentSongDetails.tapPerfect,
      tapGreat: maimaiRecentSongDetails.tapGreat,
      tapGood: maimaiRecentSongDetails.tapGood,
      tapMiss: maimaiRecentSongDetails.tapMiss,
      holdCPerfect: maimaiRecentSongDetails.holdCPerfect,
      holdPerfect: maimaiRecentSongDetails.holdPerfect,
      holdGreat: maimaiRecentSongDetails.holdGreat,
      holdGood: maimaiRecentSongDetails.holdGood,
      holdMiss: maimaiRecentSongDetails.holdMiss,
      slideCPerfect: maimaiRecentSongDetails.slideCPerfect,
      slidePerfect: maimaiRecentSongDetails.slidePerfect,
      slideGreat: maimaiRecentSongDetails.slideGreat,
      slideGood: maimaiRecentSongDetails.slideGood,
      slideMiss: maimaiRecentSongDetails.slideMiss,
      touchCPerfect: maimaiRecentSongDetails.touchCPerfect,
      touchPerfect: maimaiRecentSongDetails.touchPerfect,
      touchGreat: maimaiRecentSongDetails.touchGreat,
      touchGood: maimaiRecentSongDetails.touchGood,
      touchMiss: maimaiRecentSongDetails.touchMiss,
      breakCPerfect: maimaiRecentSongDetails.breakCPerfect,
      breakPerfect: maimaiRecentSongDetails.breakPerfect,
      breakGreat: maimaiRecentSongDetails.breakGreat,
      breakGood: maimaiRecentSongDetails.breakGood,
      breakMiss: maimaiRecentSongDetails.breakMiss,
    })
    .from(userRecentSongs)
    .innerJoin(songs, eq(userRecentSongs.songId, songs.id))
    .innerJoin(parentSong, eq(songs.parentId, parentSong.id))
    .leftJoin(maimaiRecentSongDetails, eq(userRecentSongs.id, maimaiRecentSongDetails.recentSongId))
    .where(
      and(
        eq(userRecentSongs.game, "maimai"),
        eq(userRecentSongs.userId, userId),
        eq(songs.game, "maimai"),
        eq(songs.region, region),
        beforeDate ? lte(userRecentSongs.playedAt, beforeDate) : undefined
      )
    )
    .orderBy(desc(userRecentSongs.playedAt))
    .limit(maxTracksToFetch);

  if (recentPlays.length === 0) {
    log.warn('No recent plays found');
    return {
      type: "error",
      error: 'No recent plays found',
    };
  }
  log.debug({ count: recentPlays.length, durationMs: Date.now() - startTime }, 'Fetched recent plays');

  // Group tracks into credits
  // Track numbers go in DESCENDING order within a credit: 4, 3, 2, 1
  // A credit can have 1-4 tracks depending on what the player selected
  // Example sequence: [4,3,2,1], [4,3,2,1], [3,2,1], [4,3,2,1], [2,1]
  type TrackData = typeof recentPlays[0];
  const credits: TrackData[][] = [];
  let currentCreditTracks: TrackData[] = [];

  for (let i = 0; i < recentPlays.length; i++) {
    const track = recentPlays[i];
    currentCreditTracks.push(track);

    // Check if this is the last track of a credit
    // A credit ends when the next track number is >= current (wraps to new credit)
    // or when we've reached the end of the array
    const isLastTrack = i === recentPlays.length - 1 || recentPlays[i + 1].track >= track.track;

    if (isLastTrack) {
      credits.push([...currentCreditTracks]);
      currentCreditTracks = [];
    }
  }

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
  const hasNextCredit = beforeDate !== undefined;
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
      .select(gameSnapshotColumns)
      .from(userSnapshots)
      .where(and(
        eq(userSnapshots.game, "maimai"),
        eq(userSnapshots.userId, userId),
        eq(userSnapshots.region, region),
        beforeDate ? lte(userSnapshots.fetchedAt, beforeDate) : undefined,
      ))
      .orderBy(desc(userSnapshots.fetchedAt))
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
        songId: track.songId,
        playedAt: track.playedAt,
        scoreValue: track.scoreValue,
        secondaryScore: track.secondaryScore,
        maxDxScore: track.maxDxScore,
        comboStatus: track.comboStatus,
        syncStatus: track.syncStatus,
        track: track.track,
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

  return {
    type: "success",
    credit: creditData,
    snapshot,
    visitableProfileAt,
    hasNextCredit,
    hasPreviousCredit,
  };
}
