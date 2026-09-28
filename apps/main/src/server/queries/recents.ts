import { decodeChunithmRecentDetails } from "@/lib/games/chunithm/recent-details";
import type { CanonicalGameId } from "@/lib/games/types";
import { songInstanceId } from "@/lib/db/song-instance-id";
import { db } from "@/lib/db";
import { parentSong, songs, userRecentSongs, maimaiRecentSongDetails } from "@/lib/db/schema-pg";
import { and, count, desc, eq, lt } from "drizzle-orm";
import type { Region } from "@/lib/types";

export async function fetchRecentSongs(game: CanonicalGameId,
  userId: string,
  region: Region,
  limit: number,
  offset: number,
  beforeDate?: Date
) {
  const whereClause = and(
    and(eq(userRecentSongs.game, game), eq(userRecentSongs.userId, userId)),
    and(eq(songs.game, game), eq(songs.region, region)),
    beforeDate ? lt(userRecentSongs.playedAt, beforeDate) : undefined
  );

  const recentPlays = await db
    .select({
      recentSongId: userRecentSongs.id,
      playedAt: userRecentSongs.playedAt,
      scoreValue: userRecentSongs.scoreValue,
      secondaryScore: userRecentSongs.secondaryScore,
      comboStatus: userRecentSongs.comboStatus,
      syncStatus: userRecentSongs.syncStatus,
      clearStatus: userRecentSongs.clearStatus,
      maxDxScore: userRecentSongs.maxDxScore,
      track: userRecentSongs.track,
      songId: songInstanceId,
      songName: parentSong.songName,
      artist: parentSong.artist,
      cover: parentSong.cover,
      metadata: userRecentSongs.metadata,
      difficultyCode: parentSong.difficulty,
      typeCode: parentSong.type,
      level: songs.level,
      levelPrecise: songs.levelPrecise,
      genre: parentSong.genre,
      fastCount: maimaiRecentSongDetails.fastCount,
      lateCount: maimaiRecentSongDetails.lateCount,
      combo: maimaiRecentSongDetails.combo,
      maxCombo: maimaiRecentSongDetails.maxCombo,
      syncScore: maimaiRecentSongDetails.syncScore,
      maxSyncScore: maimaiRecentSongDetails.maxSyncScore,
      rating: maimaiRecentSongDetails.rating,
      ratingChange: maimaiRecentSongDetails.ratingChange,
      venue: maimaiRecentSongDetails.venue,
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
    .where(whereClause)
    .orderBy(desc(userRecentSongs.playedAt))
    .limit(limit)
    .offset(offset);

  const [{ totalCount }] = await db
    .select({ totalCount: count() })
    .from(userRecentSongs)
    .innerJoin(songs, eq(userRecentSongs.songId, songs.id))
    .innerJoin(parentSong, eq(songs.parentId, parentSong.id))
    .where(whereClause);

  return {
    recentPlays: recentPlays.map(play => ({
      ...play,
      maxDxScore: play.maxDxScore ?? 0,
      track: play.track ?? 0,
      chunithmDetails: game === "chunithm" ? decodeChunithmRecentDetails(play.metadata) : null,
    })),
    totalCount,
    hasMore: offset + limit < totalCount,
  };
}
