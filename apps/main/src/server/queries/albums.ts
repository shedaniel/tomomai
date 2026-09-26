import type { CanonicalGameId } from "@/lib/games/types";
import { songInstanceId } from "@/lib/db/song-instance-id";
import { db } from "@/lib/db";
import { parentSong, songs, userAlbums } from "@/lib/db/schema-pg";
import { and, desc, eq, sql } from "drizzle-orm";
import type { Region } from "@/lib/types";

export async function fetchUserAlbums(game: CanonicalGameId,
  userId: string,
  region: Region,
  limit: number,
  offset: number
) {
  const userAlbumsList = await db
    .select({
      id: userAlbums.id,
      songId: songInstanceId,
      songName: parentSong.songName,
      artist: parentSong.artist,
      cover: parentSong.cover,
      metadata: userAlbums.metadata,
      difficultyCode: parentSong.difficulty,
      typeCode: parentSong.type,
      level: songs.level,
      levelPrecise: songs.levelPrecise,
      takenAt: userAlbums.takenAt,
      imageKey: userAlbums.imageKey,
      imageSize: userAlbums.imageSize,
      venue: userAlbums.venue,
      createdAt: userAlbums.createdAt,
    })
    .from(userAlbums)
    .innerJoin(songs, eq(userAlbums.songId, songs.id))
    .innerJoin(parentSong, eq(songs.parentId, parentSong.id))
    .where(
      and(
        and(eq(userAlbums.game, game), eq(userAlbums.userId, userId)),
        and(eq(songs.game, game), eq(songs.region, region))
      )
    )
    .orderBy(desc(userAlbums.takenAt))
    .limit(limit + 1)
    .offset(offset);

  const hasMore = userAlbumsList.length > limit;
  const albums = hasMore ? userAlbumsList.slice(0, limit) : userAlbumsList;

  return {
    albums: albums.map((album) => ({
      id: album.id.toString(),
      songId: album.songId,
      songName: album.songName,
      artist: album.artist,
      cover: album.cover,
      difficultyCode: album.difficultyCode,
      typeCode: album.typeCode,
      level: album.level,
      levelPrecise: album.levelPrecise,
      takenAt: album.takenAt.toISOString(),
      imageKey: album.imageKey ?? "",
      imageSize: album.imageSize ?? 0,
      venue: album.venue,
      metadata: album.metadata,
      createdAt: album.createdAt.toISOString(),
    })),
    hasMore,
  };
}

export async function fetchAlbumStorageUsage(game: CanonicalGameId, userId: string) {
  const [storageResult, intlStorageResult, jpStorageResult] = await Promise.all([
    db
      .select({
        totalSize: sql<number>`COALESCE(SUM(${userAlbums.imageSize}), 0)`,
      })
      .from(userAlbums)
      .where(and(eq(userAlbums.game, game), eq(userAlbums.userId, userId))),
    db
      .select({
        totalSize: sql<number>`COALESCE(SUM(${userAlbums.imageSize}), 0)`,
      })
      .from(userAlbums)
      .innerJoin(songs, eq(userAlbums.songId, songs.id))
      .innerJoin(parentSong, eq(songs.parentId, parentSong.id))
      .where(and(
        and(eq(userAlbums.game, game), eq(userAlbums.userId, userId)),
        and(eq(songs.game, game), eq(songs.region, 'intl'))
      )),
    db
      .select({
        totalSize: sql<number>`COALESCE(SUM(${userAlbums.imageSize}), 0)`,
      })
      .from(userAlbums)
      .innerJoin(songs, eq(userAlbums.songId, songs.id))
      .innerJoin(parentSong, eq(songs.parentId, parentSong.id))
      .where(and(
        and(eq(userAlbums.game, game), eq(userAlbums.userId, userId)),
        and(eq(songs.game, game), eq(songs.region, 'jp'))
      )),
  ]);

  return {
    totalUsed: Number(storageResult[0]?.totalSize || 0),
    intlUsed: Number(intlStorageResult[0]?.totalSize || 0),
    jpUsed: Number(jpStorageResult[0]?.totalSize || 0),
  };
}
