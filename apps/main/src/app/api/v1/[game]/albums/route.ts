import { type NextRequest } from "next/server";
import { withApiKey, keyHasScope } from "@/lib/api/protect";
import { parseQuery } from "@/lib/api/parse-query";
import { parseParams } from "@/lib/api/parse-params";
import { zodJson } from "@/lib/api/zod-response";
import { fetchUserAlbums } from "@/server/queries/albums";
import { spec } from "./spec";

export const GET = withApiKey(["album:read"], async (req: NextRequest, key, ctx) => {
  const params = await parseParams(ctx.params, spec.params!);
  if (params instanceof Response) return params;
  const parsed = parseQuery(req.nextUrl.searchParams, spec.query!);
  if (parsed instanceof Response) return parsed;
  const { region, limit = 20, offset = 0 } = parsed;

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
