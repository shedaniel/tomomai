import { db } from "@/lib/db";
import { flushLogger } from "@/lib/logger";
import { requestLogger } from "@/lib/request-logger";
import { getEnabledRegions, isRegionEnabled } from "@/lib/enabled-regions";
import { Region } from "@/lib/types";
import { getCurrentVersion } from "@/lib/metadata";
import { normalizeName } from "@/lib/name-utils";
import { songs, parentSong } from "@/lib/db/schema-pg";
import { and, eq, inArray, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { publishSongCatalog } from "@/server/services/admin/song-catalog";
import { revalidatePath, revalidateTag } from "next/cache";
import { locales } from "@tomomai/i18n/locale";
import type { Logger } from "pino";


export async function GET(request: NextRequest) {
  const { log, requestId } = requestLogger(request, "admin/db");
  try {
    // Check for admin token authentication
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      return NextResponse.json(
        { error: "Missing authorization token" },
        { status: 401 }
      );
    }

    // Validate token against environment variable
    const adminToken = process.env.ADMIN_UPDATE_TOKEN;
    if (!adminToken) {
      log.error("ADMIN_UPDATE_TOKEN environment variable not set");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    if (token !== adminToken) {
      log.warn("Invalid admin token attempt");
      return NextResponse.json(
        { error: "Invalid authorization token" },
        { status: 403 }
      );
    }

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const type = (searchParams.get('type') || "normalize") as "normalize";
    if (type === "normalize") {
      return await normalize(searchParams, log);
    } else {
      return NextResponse.json(
        { error: "Invalid 'type' parameter. Must be 'normalize'" },
        { status: 400 }
      );
    }
  } catch (error) {
    log.error({ err: error }, "Error in admin db route");
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error", requestId },
      { status: 500 }
    );
  } finally {
    await flushLogger();
  }
}

// Only allow GET requests
export async function POST() {
  return NextResponse.json(
    { error: "Method not allowed" },
    { status: 405 }
  );
}

async function normalize(searchParams: URLSearchParams, log: Logger) {
  const region = searchParams.get('region') as Region | null;

  if (!region || !isRegionEnabled(region)) {
    return NextResponse.json(
      { error: `Missing or invalid 'region' query parameter. Must be one of: ${getEnabledRegions().join(", ")}` },
      { status: 400 }
    );
  }

  const version = searchParams.get("version");
  const currentVersion = version ? Number(version) : getCurrentVersion(region);
  if (!Number.isInteger(currentVersion)) {
    return NextResponse.json({ error: "Invalid version" }, { status: 400 });
  }

  const totalMasterNamesNormalized = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(73641932)`);
    const selected = await tx.selectDistinct({ parentId: songs.parentId }).from(songs)
      .where(and(eq(songs.region, region), eq(songs.gameVersion, currentVersion)));
    if (selected.length === 0) return 0;
    const parents = await tx.select().from(parentSong)
      .where(inArray(parentSong.id, selected.map(song => song.parentId)))
      .orderBy(parentSong.id);
    let updated = 0;
    for (const parent of parents) {
      const songName = normalizeName(parent.songName);
      if (songName === parent.songName) continue;
      const collisions = await tx.select({ disambiguator: parentSong.disambiguator }).from(parentSong)
        .where(and(eq(parentSong.songName, songName), eq(parentSong.type, parent.type), eq(parentSong.difficulty, parent.difficulty)));
      const occupied = new Set(collisions.map(row => row.disambiguator));
      let disambiguator = parent.disambiguator;
      // Normalizing a title is insufficient evidence to merge chart identities.
      if (occupied.has(disambiguator)) disambiguator = Math.max(...occupied) + 1;
      await tx.update(parentSong).set({ songName, disambiguator }).where(eq(parentSong.id, parent.id));
      updated++;
    }
    return updated;
  });

  await publishSongCatalog();
  revalidateTag("all-unique-songs", { expire: 3600 });
  revalidateTag("reserved-songs", { expire: 0 });
  revalidateTag("api-v1-songs", { expire: 0 });
  for (const locale of locales) {
    revalidatePath(`/${locale}/db/songs/[slug]`, "page");
    revalidatePath(`/${locale}/db/songs`, "page");
  }
  revalidatePath("/sitemap.xml", "page");
  log.info({ totalMasterNamesNormalized }, "Parent song names normalized");
  return NextResponse.json({
    success: true,
    message: "Song data normalization completed",
    statistics: { totalDuplicatesMerged: 0, totalMasterNamesNormalized },
  });
}
