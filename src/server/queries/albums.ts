import { db } from "@/lib/db";
import { songs, userAlbums } from "@/lib/db/schema-pg";
import { and, desc, eq } from "drizzle-orm";
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
      venue: album.venue,
      createdAt: album.createdAt.toISOString(),
    })),
    hasMore,
  };
}
