import type { CanonicalGameId, Region } from "@/lib/games/ids";
import { hasCapability } from "@/lib/games/access";
import { getSupportedRegions } from "@/lib/games/regions";
import { songInstanceId } from "@/lib/db/song-instance-id";
import { db } from "@/lib/db";
import { parentSong, songs, userAlbums } from "@/lib/db/schema-pg";
import { and, desc, eq, sql } from "drizzle-orm";

export async function fetchUserAlbums(
  game: CanonicalGameId,
  userId: string,
  region: Region,
  limit: number,
  offset: number,
) {
  const userAlbumsList = await db
    .select({
      id: userAlbums.id,
      songId: songInstanceId,
      songName: parentSong.songName,
      artist: parentSong.artist,
      cover: parentSong.cover,
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
    .where(and(eq(userAlbums.game, game), eq(userAlbums.userId, userId), eq(songs.region, region)))
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
      imageKey: album.imageKey,
      imageSize: album.imageSize,
      venue: album.venue,
      createdAt: album.createdAt.toISOString(),
    })),
    hasMore,
  };
}

/** Album storage used across the game, and per enabled region that offers albums. */
export async function fetchAlbumStorageUsage(game: CanonicalGameId, userId: string) {
  const usage = await db
    .select({
      region: songs.region,
      size: sql<number>`COALESCE(SUM(${userAlbums.imageSize}), 0)`.mapWith(Number),
    })
    .from(userAlbums)
    .innerJoin(songs, eq(userAlbums.songId, songs.id))
    .where(and(eq(userAlbums.game, game), eq(userAlbums.userId, userId)))
    .groupBy(songs.region);

  const sizeOf = (region: Region) => usage.find(row => row.region === region)?.size ?? 0;
  return {
    totalUsed: usage.reduce((total, row) => total + row.size, 0),
    byRegion: getSupportedRegions(game)
      .filter(region => hasCapability(game, "albums", region))
      .map(region => ({ region, used: sizeOf(region) })),
  };
}
