import type { CanonicalGameId } from "@/lib/games/types";
import { songInstanceId } from "@/lib/db/song-instance-id";
import { db } from "@/lib/db";
import { parentSong, songs, userRecentSongs } from "@/lib/db/schema-pg";
import { GAME_SERVER_MODULES } from "@/server/services/games/registry";
import { and, count, desc, eq, lt } from "drizzle-orm";
import type { Region } from "@/lib/types";

export async function fetchRecentSongs(
  game: CanonicalGameId,
  userId: string,
  region: Region,
  limit: number,
  offset: number,
  beforeDate?: Date,
) {
  const whereClause = and(
    eq(userRecentSongs.game, game),
    eq(userRecentSongs.userId, userId),
    eq(songs.region, region),
    beforeDate ? lt(userRecentSongs.playedAt, beforeDate) : undefined,
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
      metadata: userRecentSongs.metadata,
      track: userRecentSongs.track,
      songId: songInstanceId,
      songName: parentSong.songName,
      artist: parentSong.artist,
      cover: parentSong.cover,
      difficultyCode: parentSong.difficulty,
      typeCode: parentSong.type,
      level: songs.level,
      levelPrecise: songs.levelPrecise,
      genre: parentSong.genre,
    })
    .from(userRecentSongs)
    .innerJoin(songs, eq(userRecentSongs.songId, songs.id))
    .innerJoin(parentSong, eq(songs.parentId, parentSong.id))
    .where(whereClause)
    .orderBy(desc(userRecentSongs.playedAt))
    .limit(limit)
    .offset(offset);

  const [[{ totalCount }], details] = await Promise.all([
    db
      .select({ totalCount: count() })
      .from(userRecentSongs)
      .innerJoin(songs, eq(userRecentSongs.songId, songs.id))
      .where(whereClause),
    GAME_SERVER_MODULES[game].recentDetails(recentPlays),
  ]);

  return {
    recentPlays: recentPlays.map(({ maxDxScore, metadata, ...play }, index) => ({
      ...play,
      track: play.track ?? 0,
      details: details[index],
    })),
    totalCount,
    hasMore: offset + limit < totalCount,
  };
}
