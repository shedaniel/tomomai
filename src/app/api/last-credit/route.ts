import { db } from '@/lib/db';
import { getServerSession } from '@/lib/auth-server';
import { songs, user, userRecentSongs, userRecentSongsDetailed, userSnapshots } from '@/lib/db/schema-pg';
import { and, desc, eq, lte, lt } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { ImageCache, renderLastCreditImage } from '@/lib/render-image';
import { fetchImageForServer } from '@/lib/render-image-server';
import { Image, loadImage } from 'skia-canvas';
import { TitleType } from '@/lib/types';
import { getRatingImageUrl } from '@/lib/rating-calculator';
import { DIFFICULTY_ENUM } from '@/lib/db/types';

export const dynamic = "force-dynamic";

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
  fc: string;
  fs: string;
  track: number;
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
  gameVersion: number;
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
export type LastCreditPrepareResult = {
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

async function prepareData(
  userId: string,
  region: 'intl' | 'jp',
  beforeDate?: Date
): Promise<LastCreditPrepareResult> {
  console.log('Fetching recent songs for last credit...');
  let startTime = Date.now();

  // We need to fetch enough tracks to find the complete credit
  // A credit can have up to 4 tracks, so we fetch extra to:
  // 1. Find the current credit's tracks
  // 2. Check if there are more credits available
  const maxTracksToFetch = 8; // Current credit (4 max) + next credit (4 max)

  const recentPlays = await db
    .select({
      id: userRecentSongs.id,
      playedAt: userRecentSongs.playedAt,
      achievement: userRecentSongs.archievement, // Note: typo in schema
      dxScore: userRecentSongs.dxScore,
      maxDxScore: userRecentSongs.maxDxScore,
      fc: userRecentSongs.fc,
      fs: userRecentSongs.fs,
      track: userRecentSongs.track,
      songName: songs.songName,
      artist: songs.artist,
      cover: songs.cover,
      difficulty: songs.difficulty,
      level: songs.level,
      levelPrecise: songs.levelPrecise,
      type: songs.type,
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
    .leftJoin(userRecentSongsDetailed, eq(userRecentSongs.id, userRecentSongsDetailed.recentSongId))
    .where(
      and(
        eq(userRecentSongs.userId, userId),
        eq(songs.region, region),
        beforeDate ? lte(userRecentSongs.playedAt, beforeDate) : undefined
      )
    )
    .orderBy(desc(userRecentSongs.playedAt))
    .limit(maxTracksToFetch);

  if (recentPlays.length === 0) {
    console.error('No recent plays found');
    return {
      type: "error",
      error: 'No recent plays found',
    };
  }
  console.log(`Fetched ${recentPlays.length} recent plays in ${Date.now() - startTime}ms`);

  // Group tracks into credits
  // A credit ends when track number increases (goes from higher to lower means new credit)
  type TrackData = typeof recentPlays[0];
  const credits: TrackData[][] = [];
  let currentCreditTracks: TrackData[] = [];

  for (let i = 0; i < recentPlays.length; i++) {
    const track = recentPlays[i];
    currentCreditTracks.push(track);

    // Check if this is the last track of a credit
    // Track numbers go 1, 2, 3, 4 within a credit
    // If next track has a higher number, it means we're still in the same credit
    // If next track has a lower/equal number, or we're at the end, credit is complete
    const isLastTrack = i === recentPlays.length - 1 || recentPlays[i + 1].track >= track.track;

    if (isLastTrack) {
      credits.push([...currentCreditTracks]);
      currentCreditTracks = [];
    }
  }

  if (credits.length === 0) {
    console.error('No credits found');
    return {
      type: "error",
      error: 'No credits found',
    };
  }

  // The first credit is the most recent one (or the one before beforeDate)
  const targetCredit = credits[0];
  const creditPlayedAt = targetCredit[0].playedAt;

  // Check if there's a next credit (more recent - only when using beforeDate)
  const hasNextCredit = beforeDate !== undefined;
  // Check if there's a previous credit (older)
  const hasPreviousCredit = credits.length > 1;

  // Get user privacy settings and snapshot closest to (but not after) the credit date
  console.log('Fetching user privacy settings and snapshot...');
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
        beforeDate ? lte(userSnapshots.fetchedAt, beforeDate) : undefined,
      ))
      .orderBy(desc(userSnapshots.fetchedAt))
      .limit(1),
  ]);

  if (userRecord.length === 0) {
    console.error('User not found');
    return {
      type: "error",
      error: 'User not found',
    };
  }

  if (snapshotRecord.length === 0) {
    console.error('No snapshot found for this credit date');
    return {
      type: "error",
      error: 'No snapshot found for this credit date',
    };
  }

  const snapshot = snapshotRecord[0];
  console.log(`User privacy settings and snapshot fetched in ${Date.now() - startTime}ms`);

  // Determine visitable profile URL
  const visitableProfileAt = userRecord[0].publishProfile && userRecord[0].username
    ? userRecord[0].username
    : null;

  const creditData: CreditData = {
    playedAt: creditPlayedAt,
    tracks: targetCredit.map(track => {
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
    gameVersion: snapshot.gameVersion,
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

export async function GET(request: NextRequest) {
  console.log('Starting last-credit image API request');
  try {
    // Get user session
    const session = await getServerSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    // Parse query parameters
    const region = request.nextUrl.searchParams.get('region') as 'intl' | 'jp' | null;
    const beforeDateStr = request.nextUrl.searchParams.get('beforeDate');
    const scaleParam = request.nextUrl.searchParams.get('scale');
    const scale = scaleParam === '1' ? 1 : 2; // Accept 1 or 2, default to 2

    if (!region || (region !== 'intl' && region !== 'jp')) {
      return NextResponse.json({ error: 'Valid region (intl or jp) is required' }, { status: 400 });
    }

    const beforeDate = beforeDateStr ? new Date(beforeDateStr) : undefined;
    if (beforeDateStr && isNaN(beforeDate!.getTime())) {
      return NextResponse.json({ error: 'Invalid beforeDate format' }, { status: 400 });
    }

    console.log(`Region: ${region}, beforeDate: ${beforeDate?.toISOString() ?? 'none'}, scale: ${scale}`);

    const prepareDataResult = await prepareData(userId, region, beforeDate);
    if (prepareDataResult.type === "error") {
      return NextResponse.json({ error: prepareDataResult.error }, { status: 404 });
    }

    const { credit, snapshot, visitableProfileAt, hasNextCredit, hasPreviousCredit } = prepareDataResult;

    const imagesToCache = [
      "https://maimaidx.jp/maimai-mobile/img/music_dx.png",
      "https://maimaidx.jp/maimai-mobile/img/music_standard.png",
      getRatingImageUrl(snapshot.rating),
      snapshot.iconUrl,
      snapshot.classRankUrl,
      snapshot.courseRankUrl,
      `/res/trophy/normal.png`,
      `/res/trophy/bronze.png`,
      `/res/trophy/silver.png`,
      `/res/trophy/gold.png`,
      `/res/trophy/rainbow.png`,
      `/res/character/${snapshot.gameVersion}.png`,
      `/res/logo/${snapshot.gameVersion}.png`,
      `/res/bg/${snapshot.gameVersion}.png`,
      `/res/badge/${snapshot.gameVersion}/none.png`,
      `/res/badge/${snapshot.gameVersion}/sync.png`,
      `/res/badge/${snapshot.gameVersion}/fc.png`,
      `/res/badge/${snapshot.gameVersion}/fc+.png`,
      `/res/badge/${snapshot.gameVersion}/fs.png`,
      `/res/badge/${snapshot.gameVersion}/fs+.png`,
      `/res/badge/${snapshot.gameVersion}/fdx.png`,
      `/res/badge/${snapshot.gameVersion}/fdx+.png`,
      `/res/numbers/percentage_blue.png`,
      `/res/numbers/percentage_red.png`,
      `/res/numbers/percentage_gold.png`,
      `/res/numbers/score_blue.png`,
      `/res/numbers/score_red.png`,
      `/res/numbers/score_gold.png`,
      `/res/numbers/score_big_blue.png`,
      `/res/numbers/score_big_red.png`,
      `/res/numbers/score_big_gold.png`,
      `/res/songs/score_table.png`,
      `/res/songs/fast_late.png`,
      ...Object.values(DIFFICULTY_ENUM).map(difficulty => `/res/songs/song_${difficulty}.png`),
      ...Object.values(DIFFICULTY_ENUM).map(difficulty => `/res/songs/music_jacket_${difficulty}.png`),
      ...credit.tracks.map(s => s.cover),
    ];

    const startTime = Date.now();
    const cache: ImageCache = {};
    await Promise.all(
      imagesToCache.map(async (url) => {
        try {
          if (url.startsWith('data:')) return;
          return fetchImageForServer(url).then(async img => {
            let memo: Image | null = null;
            cache[url] = async () => memo || (memo = await loadImage(img));
          });
        } catch (error) {
          console.warn(`⚠️ Failed to cache image: ${url}`, error);
        }
      })
    );
    console.log(`✅ Cached ${Object.keys(cache).length} images in ${Date.now() - startTime}ms`);

    // Render the image using skia-canvas
    const canvas = await renderLastCreditImage(credit, snapshot, cache);

    // Convert canvas to JPEG buffer and return
    const buffer = await canvas.toBuffer('jpeg', { density: scale, quality: 0.7 });
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Disposition': `attachment; filename="maimai-last-credit.jpg"`,
        'Content-Length': buffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('Failed to generate last credit image:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');

    return NextResponse.json(
      {
        error: 'Failed to generate image',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
