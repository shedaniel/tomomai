import type { CanonicalGameId } from "@/lib/games/types";
import { codeToChartType, codeToComboStatus, codeToDifficulty, codeToSyncStatus } from "@/lib/maimai/codes";
import { songInstanceId } from "@/lib/db/song-instance-id";
import { db } from "@/lib/db";
import { parentSong, songs, userRecentSongs, userRecentSongsDetailed } from "@/lib/db/schema-pg";
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
      achievement: userRecentSongs.scoreValue,
      dxScore: userRecentSongs.secondaryScore,
      maxDxScore: userRecentSongs.maxDxScore,
      fc: userRecentSongs.comboStatus,
      fs: userRecentSongs.syncStatus,
      track: userRecentSongs.track,
      songId: songInstanceId,
      songName: parentSong.songName,
      artist: parentSong.artist,
      cover: parentSong.cover,
      difficultyCode: parentSong.difficulty,
      typeCode: parentSong.type,
      difficulty: parentSong.difficulty,
      level: songs.level,
      levelPrecise: songs.levelPrecise,
      type: parentSong.type,
      genre: parentSong.genre,
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
    .innerJoin(parentSong, eq(songs.parentId, parentSong.id))
    .leftJoin(userRecentSongsDetailed, eq(userRecentSongs.id, userRecentSongsDetailed.recentSongId))
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
    recentPlays: recentPlays.map(play => ({ ...play, maxDxScore: play.maxDxScore ?? 0, track: play.track ?? 0 })),
    totalCount,
    hasMore: offset + limit < totalCount,
  };
}
