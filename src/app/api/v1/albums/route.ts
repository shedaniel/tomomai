import { type NextRequest } from "next/server";
import { withApiKey, keyHasScope } from "@/lib/api/protect";
import { parseRegion, parsePagination } from "@/lib/api/params";
import { zodJson } from "@/lib/api/zod-response";
import { fetchUserAlbums } from "@/server/queries/albums";
import { spec } from "./spec";

export const GET = withApiKey(["album:read"], async (req: NextRequest, key) => {
  const { searchParams } = req.nextUrl;
  const region = parseRegion(searchParams);
  if (region instanceof Response) return region;

  const { limit, offset } = parsePagination(searchParams, 20, 100);
  const hasImages = keyHasScope(key, "album:images:read");
  const r2BaseUrl = process.env.NEXT_PUBLIC_R2_URL;

  const { albums, hasMore } = await fetchUserAlbums(key.userId, region, limit, offset);

  return zodJson(spec.response, {
    albums: albums.map((album) => ({
      id: album.id,
      songId: album.songId,
      songName: album.songName,
      artist: album.artist,
      cover: album.cover,
      difficulty: album.difficulty,
      level: album.level,
      levelPrecise: album.levelPrecise,
      type: album.type,
      takenAt: album.takenAt,
      venue: album.venue,
      createdAt: album.createdAt,
      imageUrl: hasImages && r2BaseUrl ? `${r2BaseUrl}/${album.imageKey}` : null,
    })),
    hasMore,
  });
});
