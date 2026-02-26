import { type NextRequest } from "next/server";
import { withApiKey, keyHasScope } from "@/lib/api/protect";
import { fetchUserAlbums } from "@/server/queries/albums";
import { getEnabledRegions } from "@/lib/enabled-regions";
import type { Region } from "@/lib/types";

export const GET = withApiKey(["album:read"], async (req: NextRequest, key) => {
  const { searchParams } = req.nextUrl;
  const region = searchParams.get("region") as Region | null;
  const enabledRegions = getEnabledRegions();

  if (!region || !enabledRegions.includes(region)) {
    return Response.json(
      { error: `Missing or invalid ?region= parameter. Valid values: ${enabledRegions.join(", ")}` },
      { status: 400 }
    );
  }

  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "20", 10) || 20, 1), 100);
  const offset = Math.max(parseInt(searchParams.get("offset") ?? "0", 10) || 0, 0);
  const hasImages = keyHasScope(key, "album:images:read");
  const r2BaseUrl = process.env.NEXT_PUBLIC_R2_URL;

  const { albums, hasMore } = await fetchUserAlbums(key.userId, region, limit, offset);

  return Response.json({
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
