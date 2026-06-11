import { db } from "@/lib/db";
import { parentSong, songs } from "@/lib/db/schema";
import { REGION_ENUM } from "@tomomai/catalog/enums";
import type { Region } from "@tomomai/catalog/types";
import { and, eq, type SQL } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

// Public read API: chart instances (children). Optional ?region= and
// ?gameVersion= filters. Instances reference their chart by the parent's
// public nanoid (songId); together with region + gameVersion that is the
// instance's full identity — internal integer ids never leave the service.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const regionParam = searchParams.get("region");
  const gameVersionParam = searchParams.get("gameVersion");

  const conditions: SQL[] = [];

  if (regionParam !== null) {
    if (!(REGION_ENUM as readonly string[]).includes(regionParam)) {
      return NextResponse.json(
        { error: `Invalid 'region' query parameter. Must be one of: ${REGION_ENUM.join(", ")}` },
        { status: 400 },
      );
    }
    conditions.push(eq(songs.region, regionParam as Region));
  }

  if (gameVersionParam !== null) {
    const gameVersion = parseInt(gameVersionParam, 10);
    if (isNaN(gameVersion)) {
      return NextResponse.json(
        { error: "Invalid 'gameVersion' query parameter. Must be a number" },
        { status: 400 },
      );
    }
    conditions.push(eq(songs.gameVersion, gameVersion));
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

  const rows = conditions.length > 0
    ? await baseQuery.where(and(...conditions))
    : await baseQuery;

  return NextResponse.json(
    { songs: rows },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
