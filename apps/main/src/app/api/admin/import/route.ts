import { db } from "@/lib/db";
import { songs } from "@/lib/db/schema-pg";
import { VersionId } from "@/lib/metadata";
import { Region } from "@/lib/types";
import { getEnabledRegions, isRegionEnabled } from "@/lib/enabled-regions";
import { flushLogger } from "@/lib/logger";
import { requestLogger } from "@/lib/request-logger";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { NextRequest, NextResponse } from "next/server";

const REGION_PATTERN = "[a-z]+";
const FROM_REGEX = new RegExp(`^version(<=|>=|=)(\\d+)@(${REGION_PATTERN})-(-?\\d+)$`);
const TO_REGEX = new RegExp(`^(${REGION_PATTERN})-(-?\\d+)$`);

function regionsHint(): string {
  return `[${getEnabledRegions().join("|")}]`;
}

// Helper function to parse the "from" parameter
function parseFromParameter(from: string): {
  region: Region;
  gameVersion: VersionId;
  versionFilter: "eq" | "lte" | "gte";
  versionValue: number;
} {
  // Expected format: "version<=10@intl-10" or "version=11@jp-11" or "version>=5@intl-10"
  const match = from.match(FROM_REGEX);

  if (!match) {
    throw new Error(`Invalid 'from' parameter format. Expected format: version[<=|>=|=]NUMBER@${regionsHint()}-NUMBER`);
  }

  const [, operator, versionValue, region, gameVersion] = match;

  if (!isRegionEnabled(region as Region)) {
    throw new Error(`Invalid region in 'from' parameter: ${region}. Must be one of: ${getEnabledRegions().join(", ")}`);
  }

  const versionFilter = operator === "<=" ? "lte" : operator === ">=" ? "gte" : "eq";

  return {
    region: region as Region,
    gameVersion: parseInt(gameVersion, 10) as VersionId,
    versionFilter,
    versionValue: parseInt(versionValue, 10),
  };
}

// Helper function to parse the "to" parameter
function parseToParameter(to: string): {
  region: Region;
  gameVersion: VersionId;
} {
  // Expected format: "intl-11" or "jp-12"
  const match = to.match(TO_REGEX);

  if (!match) {
    throw new Error(`Invalid 'to' parameter format. Expected format: ${regionsHint()}-NUMBER`);
  }

  const [, region, gameVersion] = match;

  if (!isRegionEnabled(region as Region)) {
    throw new Error(`Invalid region in 'to' parameter: ${region}. Must be one of: ${getEnabledRegions().join(", ")}`);
  }

  return {
    region: region as Region,
    gameVersion: parseInt(gameVersion, 10) as VersionId,
  };
}

// Helper function to build version filter condition
function buildVersionFilter(versionFilter: "eq" | "lte" | "gte", versionValue: number) {
  switch (versionFilter) {
    case "eq":
      return eq(songs.addedVersion, versionValue);
    case "lte":
      return lte(songs.addedVersion, versionValue);
    case "gte":
      return gte(songs.addedVersion, versionValue);
    default:
      throw new Error(`Invalid version filter: ${versionFilter}`);
  }
}

export async function GET(request: NextRequest) {
  const { log, requestId } = requestLogger(request, "admin/import");
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
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');
    const mode = searchParams.get('mode'); // "only-upsert" or null (default: insert+upsert)

    if (!fromParam) {
      return NextResponse.json(
        { error: `Missing 'from' query parameter. Expected format: version[<=|>=|=]NUMBER@${regionsHint()}-NUMBER` },
        { status: 400 }
      );
    }

    if (!toParam) {
      return NextResponse.json(
        { error: `Missing 'to' query parameter. Expected format: ${regionsHint()}-NUMBER` },
        { status: 400 }
      );
    }

    if (mode && mode !== "only-upsert") {
      return NextResponse.json(
        { error: "Invalid 'mode' parameter. Must be 'only-upsert' or omitted" },
        { status: 400 }
      );
    }

    log.info({ from: fromParam, to: toParam }, `Admin import requested (mode=${mode || 'insert+upsert'})`);

    // Parse parameters
    let sourceConfig, targetConfig;

    try {
      sourceConfig = parseFromParameter(fromParam);
      targetConfig = parseToParameter(toParam);
    } catch (parseError) {
      return NextResponse.json(
        { error: parseError instanceof Error ? parseError.message : "Parameter parsing failed" },
        { status: 400 }
      );
    }

    log.debug(`Import config: ${sourceConfig.region} v${sourceConfig.gameVersion} → ${targetConfig.region} v${targetConfig.gameVersion}`);

    const versionCondition = buildVersionFilter(sourceConfig.versionFilter, sourceConfig.versionValue);

    const sourceSongs = await db
      .select()
      .from(songs)
      .where(
        and(
          eq(songs.region, sourceConfig.region),
          eq(songs.gameVersion, sourceConfig.gameVersion),
          versionCondition
        )
      );

    log.info({ count: sourceSongs.length }, "Found source songs matching criteria");

    if (sourceSongs.length === 0) {
      return NextResponse.json({
        success: true,
        requestId,
        message: "No songs found matching the source criteria",
        statistics: {
          sourceFound: 0,
          imported: 0,
          updated: 0,
          skipped: 0,
          from: fromParam,
          to: toParam,
          mode: mode || 'insert+upsert',
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Step 2: Check existing songs in target if mode is "only-upsert"
    let existingTargetSongs: any[] = [];

    if (mode === "only-upsert") {
      log.debug("Querying existing target songs for upsert mode");
      existingTargetSongs = await db
        .select()
        .from(songs)
        .where(
          and(
            eq(songs.region, targetConfig.region),
            eq(songs.gameVersion, targetConfig.gameVersion)
          )
        );

      log.debug({ count: existingTargetSongs.length }, "Found existing songs in target");
    }

    const targetSongs: any[] = [];
    let importedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    // Create a map of existing target songs for quick lookup (songName + difficulty + type)
    const existingTargetMap = new Map<string, any>();
    if (mode === "only-upsert") {
      existingTargetSongs.forEach(song => {
        const key = `${song.songName}|${song.difficulty}|${song.type}`;
        existingTargetMap.set(key, song);
      });
    }

    for (const sourceSong of sourceSongs) {
      const songKey = `${sourceSong.songName}|${sourceSong.difficulty}|${sourceSong.type}`;

      if (mode === "only-upsert") {
        // Only include songs that already exist in target
        if (!existingTargetMap.has(songKey)) {
          log.debug({ songKey }, "Skipping new song in upsert mode");
          skippedCount++;
          continue;
        }
        updatedCount++;
      } else {
        importedCount++;
      }

      // Create new song record with target region/version
      // ID is auto-generated by PostgreSQL, publicId is generated via nanoid
      const { id, publicId, ...songWithoutIds } = sourceSong;
      const targetSong = {
        ...songWithoutIds,
        publicId: nanoid(),
        region: targetConfig.region,
        gameVersion: targetConfig.gameVersion,
      };

      targetSongs.push(targetSong);
    }

    log.info({ count: targetSongs.length }, "Prepared songs for import");

    // Step 4: Perform batch upsert
    if (targetSongs.length > 0) {
      log.debug({ count: targetSongs.length }, "Performing batch upsert");

      try {
        // Split into batches of 1000 records to avoid SQL limits
        const batchSize = 1000;
        let totalProcessed = 0;

        for (let i = 0; i < targetSongs.length; i += batchSize) {
          const batch = targetSongs.slice(i, i + batchSize);
          log.debug(`Upserting batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(targetSongs.length / batchSize)} (${batch.length} songs)`);

          await db.insert(songs).values(batch).onConflictDoUpdate({
            target: [songs.songName, songs.difficulty, songs.type, songs.region, songs.gameVersion, songs.addedVersion],
            set: {
              artist: sql`excluded.artist`,
              cover: sql`excluded.cover`,
              level: sql`excluded.level`,
              levelPrecise: sql`excluded."levelPrecise"`,
              genre: sql`excluded.genre`,
              bpm: sql`excluded.bpm`,
              noteDesigner: sql`excluded."noteDesigner"`,
              tapCount: sql`excluded."tapCount"`,
              holdCount: sql`excluded."holdCount"`,
              slideCount: sql`excluded."slideCount"`,
              touchCount: sql`excluded."touchCount"`,
              breakCount: sql`excluded."breakCount"`,
            },
          });

          totalProcessed += batch.length;
        }

        log.debug({ count: totalProcessed }, "Upserted songs to target");
      } catch (error) {
        log.error({ err: error }, "Error during batch upsert");
        throw new Error(`Database upsert failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }

    const totalProcessed = mode === "only-upsert" ? updatedCount : importedCount;
    log.info({ count: totalProcessed, skipped: skippedCount }, "Import completed");

    return NextResponse.json({
      success: true,
      requestId,
      message: "Song import completed successfully",
      statistics: {
        sourceFound: sourceSongs.length,
        imported: mode === "only-upsert" ? 0 : importedCount,
        updated: mode === "only-upsert" ? updatedCount : 0,
        skipped: skippedCount,
        totalProcessed: targetSongs.length,
        from: fromParam,
        to: toParam,
        mode: mode || 'insert+upsert',
        sourceConfig,
        targetConfig,
        timestamp: new Date().toISOString(),
      },
    });

  } catch (error) {
    log.error({ err: error }, "Error in admin import route");
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
