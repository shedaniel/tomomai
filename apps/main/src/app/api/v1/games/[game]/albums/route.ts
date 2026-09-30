import { defineGameHandler, keyHasScope } from "@/lib/api/protect";
import { fetchUserAlbums } from "@/server/queries/albums";
import { spec } from "./spec";

export const GET = defineGameHandler(spec, async ({ game, key, query }) => {
  const { region, limit = 20, offset = 0 } = query;

  const hasImages = keyHasScope(key, "album:images:read");
  const r2BaseUrl = process.env.NEXT_PUBLIC_R2_URL;

  const { albums, hasMore } = await fetchUserAlbums(game, key.userId, region, limit, offset);

  return {
    albums: albums.map((album) => ({
      id: album.id,
      songId: album.songId,
      songName: album.songName,
      artist: album.artist,
      cover: album.cover,
      difficulty: album.difficultyCode,
      level: album.level,
      levelPrecise: album.levelPrecise,
      type: album.typeCode,
      takenAt: album.takenAt,
      venue: album.venue,
      createdAt: album.createdAt,
      imageUrl: hasImages && r2BaseUrl ? `${r2BaseUrl}/${album.imageKey}` : null,
    })),
    hasMore,
  };
});
