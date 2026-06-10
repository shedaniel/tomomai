import { db } from "@/lib/db";
import { songs } from "@/lib/db/schema";
import { REGION_ENUM } from "@tomomai/catalog/enums";
import type { Region } from "@tomomai/catalog/types";
import type { ArtifactSong } from "@tomomai/catalog/artifact";
import { and, eq, type SQL } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

// Public read API: chart instances (children), shaped like the catalog
// artifact rows. Optional ?region= and ?gameVersion= filters.
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

  const rows = conditions.length > 0
    ? await db.select().from(songs).where(and(...conditions))
    : await db.select().from(songs);

  const result: ArtifactSong[] = rows.map(s => ({
    id: Number(s.id),
    parentId: Number(s.parentId),
    region: s.region,
    gameVersion: s.gameVersion,
    addedVersion: s.addedVersion,
    level: s.level,
    levelPrecise: s.levelPrecise,
    noteDesigner: s.noteDesigner,
    tapCount: s.tapCount,
    holdCount: s.holdCount,
    slideCount: s.slideCount,
    touchCount: s.touchCount,
    breakCount: s.breakCount,
  }));

  return NextResponse.json(
    { songs: result },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
