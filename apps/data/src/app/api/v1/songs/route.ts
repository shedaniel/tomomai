import { db } from "@/lib/db";
import { parentSong, songs } from "@/lib/db/schema";
import { REGION_ENUM } from "@tomomai/catalog/enums";
import type { Region } from "@tomomai/catalog/types";
import { formatSongInstanceId } from "@tomomai/catalog/song-instance-id";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

// Public read API: chart instances (children) for one region + game version
// (both query parameters required — the full catalog is several MB and only
// travels inside the published artifact). Instances reference their chart by
// the parent's public nanoid (songId); internal integer ids never leave the
// service.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const regionParam = searchParams.get("region");
  const gameVersionParam = searchParams.get("gameVersion");

  if (regionParam === null || !(REGION_ENUM as readonly string[]).includes(regionParam)) {
    return NextResponse.json(
      { error: `Missing or invalid 'region' query parameter. Must be one of: ${REGION_ENUM.join(", ")}` },
      { status: 400 },
    );
  }

  const gameVersion = gameVersionParam === null ? NaN : parseInt(gameVersionParam, 10);
  if (isNaN(gameVersion)) {
    return NextResponse.json(
      { error: "Missing or invalid 'gameVersion' query parameter. Must be a number" },
      { status: 400 },
    );
  }

  const baseQuery = db
    .select({
      songId: parentSong.publicId,
      region: songs.region,
      gameVersion: songs.gameVersion,
      addedVersion: songs.addedVersion,
      level: songs.level,
      levelPrecise: songs.levelPrecise,
      noteDesigner: songs.noteDesigner,
      tapCount: songs.tapCount,
      holdCount: songs.holdCount,
      slideCount: songs.slideCount,
      touchCount: songs.touchCount,
      breakCount: songs.breakCount,
    })
    .from(songs)
    .innerJoin(parentSong, eq(songs.parentId, parentSong.id));

  const rows = await baseQuery.where(
    and(eq(songs.region, regionParam as Region), eq(songs.gameVersion, gameVersion))
  );

  // Composite instance id: <parent nanoid>:<regionLetter><gameVersion>;
  // truncate at ':' for the chart-level id served by /api/v1/parents.
  const result = rows.map(r => ({ ...r, songId: formatSongInstanceId(r.songId, r.region, r.gameVersion) }));

  return NextResponse.json(
    { songs: result },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
