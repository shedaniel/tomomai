import { db } from "@/lib/db";
import { songs, userRecentSongs, userRecentSongsDetailed } from "@/lib/db/schema-pg";
import { and, count, desc, eq, lt } from "drizzle-orm";
import type { Region } from "@/lib/types";

export async function fetchRecentSongs(
  userId: string,
  region: Region,
  limit: number,
  offset: number,
  beforeDate?: Date
) {
  const whereClause = and(
    eq(userRecentSongs.userId, userId),
    eq(songs.region, region),
    beforeDate ? lt(userRecentSongs.playedAt, beforeDate) : undefined
  );

  const recentPlays = await db
    .select({
      recentSongId: userRecentSongs.id,
      playedAt: userRecentSongs.playedAt,
      achievement: userRecentSongs.archievement,
      dxScore: userRecentSongs.dxScore,
      maxDxScore: userRecentSongs.maxDxScore,
      fc: userRecentSongs.fc,
      fs: userRecentSongs.fs,
      track: userRecentSongs.track,
      songId: songs.publicId,
      songName: songs.songName,
      artist: songs.artist,
      cover: songs.cover,
      difficulty: songs.difficulty,
      level: songs.level,
      levelPrecise: songs.levelPrecise,
      type: songs.type,
      genre: songs.genre,
      fastCount: userRecentSongsDetailed.fastCount,
      lateCount: userRecentSongsDetailed.lateCount,
      combo: userRecentSongsDetailed.combo,
      maxCombo: userRecentSongsDetailed.maxCombo,
      syncScore: userRecentSongsDetailed.syncScore,
      maxSyncScore: userRecentSongsDetailed.maxSyncScore,
      rating: userRecentSongsDetailed.rating,
      ratingChange: userRecentSongsDetailed.ratingChange,
      venue: userRecentSongsDetailed.venue,
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
    .where(whereClause)
    .orderBy(desc(userRecentSongs.playedAt))
    .limit(limit)
    .offset(offset);

  const [{ totalCount }] = await db
    .select({ totalCount: count() })
    .from(userRecentSongs)
    .innerJoin(songs, eq(userRecentSongs.songId, songs.id))
    .where(whereClause);

  return {
    recentPlays,
    totalCount,
    hasMore: offset + limit < totalCount,
  };
}
