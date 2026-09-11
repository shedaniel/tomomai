import { restoreSongIds } from "@/server/services/admin/song-identities";
import { parseCatalogVersion } from "@tomomai/catalog/parse-version";
import { db } from "@/lib/db";
import { songs } from "@/lib/db/schema";
import { VersionId } from "@tomomai/catalog/metadata";
import { Region } from "@/lib/types";
import { getEnabledRegions, isRegionEnabled } from "@tomomai/catalog/enabled-regions";
import { flushLogger } from "@/lib/logger";
import { requestLogger } from "@/lib/request-logger";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { publishSongCatalog } from "@/server/services/admin/song-catalog";
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
    gameVersion: parseCatalogVersion(region as Region, gameVersion),
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
    gameVersion: parseCatalogVersion(region as Region, gameVersion),
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

    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(73641932)`);
      const sourceSongs = await tx
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
      let existingTargetSongs: (typeof songs.$inferSelect)[] = [];

      if (mode === "only-upsert") {
        log.debug("Querying existing target songs for upsert mode");
        existingTargetSongs = await tx
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

      const targetSongs: (typeof songs.$inferInsert)[] = [];
      let importedCount = 0;
      let updatedCount = 0;
      let skippedCount = 0;

      const existingTargetMap = new Map<string, typeof songs.$inferSelect>();
      if (mode === "only-upsert") {
        existingTargetSongs.forEach(song => {
          const key = String(song.parentId);
          existingTargetMap.set(key, song);
        });
      }

      for (const sourceSong of sourceSongs) {
        const songKey = String(sourceSong.parentId);

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

        const { id, ...songWithoutIds } = sourceSong;
        const targetSong = {
          ...songWithoutIds,
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
            const batch = await restoreSongIds(tx, targetSongs.slice(i, i + batchSize));
            log.debug(`Upserting batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(targetSongs.length / batchSize)} (${batch.length} songs)`);

            await tx.insert(songs).values(batch).onConflictDoUpdate({
              target: [songs.parentId, songs.region, songs.gameVersion],
              set: {
                addedVersion: sql`excluded."addedVersion"`,
                level: sql`excluded.level`,
                levelPrecise: sql`excluded."levelPrecise"`,
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

    });
    await publishSongCatalog();

    return result;

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
