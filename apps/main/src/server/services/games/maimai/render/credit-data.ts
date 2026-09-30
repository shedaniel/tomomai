import "server-only";
import { db } from '@/lib/db';
import { parentSong, songs, user, userRecentSongs, maimaiRecentSongDetails } from '@/lib/db/schema-pg';
import { and, desc, eq, lte, sql } from 'drizzle-orm';
import { getLogger } from '@/lib/request-logger';
import type { Region } from '@/lib/types';
import type { GamePlayerScore, GameSnapshot } from '@/lib/games/player-view';
import { latestSnapshot } from '@/server/queries/latest-snapshot';
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
      maxDxScore: sql<number>`coalesce(${userRecentSongs.maxSecondaryScore}, 0)`.mapWith(Number).as("maxDxScore"),
      track: sql<number>`coalesce(${userRecentSongs.track}, 0)`.mapWith(Number).as("track"),
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

  const [userRecord, snapshot] = await Promise.all([
    db
      .select({ username: user.username, publishProfile: user.publishProfile })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1),
    latestSnapshot("maimai", userId, region, gameSnapshotColumns, { asOf: beforeDate }),
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
