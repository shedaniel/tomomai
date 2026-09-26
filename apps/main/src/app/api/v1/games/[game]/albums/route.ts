import { type NextRequest } from "next/server";
import { withGameApiKey as withApiKey, keyHasScope } from "@/lib/api/game-protect";
import { parseQuery } from "@/lib/api/parse-query";
import { zodJson } from "@/lib/api/zod-response";
import { fetchUserAlbums } from "@/server/queries/albums";
import { spec } from "./spec";

export const GET = withApiKey(["album:read"], async (req: NextRequest, key) => {
  const parsed = parseQuery(req.nextUrl.searchParams, spec.query!);
  if (parsed instanceof Response) return parsed;
  const { region, limit = 20, offset = 0 } = parsed;

  const hasImages = keyHasScope(key, "album:images:read");
  const r2BaseUrl = process.env.NEXT_PUBLIC_R2_URL;

  const { albums, hasMore } = await fetchUserAlbums(key.game, key.userId, region, limit, offset);

  return zodJson(spec.response, { game: key.game,
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
      imageUrl: hasImages && r2BaseUrl && album.imageKey ? `${r2BaseUrl}/${album.imageKey}` : null,
    })),
    hasMore,
  });
});
