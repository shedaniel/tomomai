import { db } from "@/lib/db";
import { songs, userAlbums } from "@/lib/db/schema-pg";
import { and, desc, eq, sql } from "drizzle-orm";
import type { Region } from "@/lib/types";

export async function fetchUserAlbums(
  userId: string,
  region: Region,
  limit: number,
  offset: number
) {
  const userAlbumsList = await db
    .select({
      id: userAlbums.id,
      songId: songs.publicId,
      songName: songs.songName,
      artist: songs.artist,
      cover: songs.cover,
      difficulty: songs.difficulty,
      level: songs.level,
      levelPrecise: songs.levelPrecise,
      type: songs.type,
      takenAt: userAlbums.takenAt,
      imageKey: userAlbums.imageKey,
      imageSize: userAlbums.imageSize,
      venue: userAlbums.venue,
      createdAt: userAlbums.createdAt,
    })
    .from(userAlbums)
    .innerJoin(songs, eq(userAlbums.songId, songs.id))
    .where(
      and(
        eq(userAlbums.userId, userId),
        eq(songs.region, region)
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
      difficulty: album.difficulty,
      level: album.level,
      levelPrecise: album.levelPrecise,
      type: album.type,
      takenAt: album.takenAt.toISOString(),
      imageKey: album.imageKey,
      imageSize: album.imageSize,
      venue: album.venue,
      createdAt: album.createdAt.toISOString(),
    })),
    hasMore,
  };
}

export async function fetchAlbumStorageUsage(userId: string) {
  const [storageResult, intlStorageResult, jpStorageResult] = await Promise.all([
    db
      .select({
        totalSize: sql<number>`COALESCE(SUM(${userAlbums.imageSize}), 0)`,
      })
      .from(userAlbums)
      .where(eq(userAlbums.userId, userId)),
    db
      .select({
        totalSize: sql<number>`COALESCE(SUM(${userAlbums.imageSize}), 0)`,
      })
      .from(userAlbums)
      .innerJoin(songs, eq(userAlbums.songId, songs.id))
      .where(and(
        eq(userAlbums.userId, userId),
        eq(songs.region, 'intl')
      )),
    db
      .select({
        totalSize: sql<number>`COALESCE(SUM(${userAlbums.imageSize}), 0)`,
      })
      .from(userAlbums)
      .innerJoin(songs, eq(userAlbums.songId, songs.id))
      .where(and(
        eq(userAlbums.userId, userId),
        eq(songs.region, 'jp')
      )),
  ]);

  return {
    totalUsed: Number(storageResult[0]?.totalSize || 0),
    intlUsed: Number(intlStorageResult[0]?.totalSize || 0),
    jpUsed: Number(jpStorageResult[0]?.totalSize || 0),
  };
}
