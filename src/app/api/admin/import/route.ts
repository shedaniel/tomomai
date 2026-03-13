import { db } from "@/lib/db";
import { songs } from "@/lib/db/schema-pg";
import { VersionId } from "@/lib/metadata";
import { Region } from "@/lib/types";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { NextRequest, NextResponse } from "next/server";

// Helper function to parse the "from" parameter
function parseFromParameter(from: string): {
  region: Region;
  gameVersion: VersionId;
  versionFilter: "eq" | "lte" | "gte";
  versionValue: number;
} {
  // Expected format: "version<=10@intl-10" or "version=11@jp-11" or "version>=5@intl-10"
  const match = from.match(/^version(<=|>=|=)(\d+)@(intl|jp)-(\d+)$/);

  if (!match) {
    throw new Error(`Invalid 'from' parameter format. Expected format: version[<=|>=|=]NUMBER@[intl|jp]-NUMBER`);
  }

  const [, operator, versionValue, region, gameVersion] = match;

  if (region !== "intl" && region !== "jp") {
    throw new Error(`Invalid region in 'from' parameter: ${region}. Must be 'intl' or 'jp'`);
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
  const match = to.match(/^(intl|jp)-(\d+)$/);

  if (!match) {
    throw new Error(`Invalid 'to' parameter format. Expected format: [intl|jp]-NUMBER`);
  }

  const [, region, gameVersion] = match;

  if (region !== "intl" && region !== "jp") {
    throw new Error(`Invalid region in 'to' parameter: ${region}. Must be 'intl' or 'jp'`);
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
      console.error("ADMIN_UPDATE_TOKEN environment variable not set");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    if (token !== adminToken) {
      console.warn("Invalid admin token attempt");
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
        { error: "Missing 'from' query parameter. Expected format: version[<=|>=|=]NUMBER@[intl|jp]-NUMBER" },
        { status: 400 }
      );
    }

    if (!toParam) {
      return NextResponse.json(
        { error: "Missing 'to' query parameter. Expected format: [intl|jp]-NUMBER" },
        { status: 400 }
      );
    }

    if (mode && mode !== "only-upsert") {
      return NextResponse.json(
        { error: "Invalid 'mode' parameter. Must be 'only-upsert' or omitted" },
        { status: 400 }
      );
    }

    console.log(`Admin import requested: from=${fromParam}, to=${toParam}, mode=${mode || 'insert+upsert'}`);

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

    console.log(`Source config:`, sourceConfig);
    console.log(`Target config:`, targetConfig);

    // Step 1: Query source songs based on criteria
    console.log("Step 1: Querying source songs...");

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

    console.log(`Found ${sourceSongs.length} source songs matching criteria`);

    if (sourceSongs.length === 0) {
      return NextResponse.json({
        success: true,
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
      console.log("Step 2: Querying existing target songs for upsert mode...");
      existingTargetSongs = await db
        .select()
        .from(songs)
        .where(
          and(
            eq(songs.region, targetConfig.region),
            eq(songs.gameVersion, targetConfig.gameVersion)
          )
        );

      console.log(`Found ${existingTargetSongs.length} existing songs in target`);
    }

    // Step 3: Prepare target songs with new IDs and target region/version
    console.log("Step 3: Preparing target songs...");

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
          console.log(`Skipping new song in upsert mode: ${songKey}`);
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

    console.log(`Prepared ${targetSongs.length} songs for import`);

    // Step 4: Perform batch upsert
    if (targetSongs.length > 0) {
      console.log(`Step 4: Performing batch upsert of ${targetSongs.length} songs...`);

      try {
        // Split into batches of 1000 records to avoid SQL limits
        const batchSize = 1000;
        let totalProcessed = 0;

        for (let i = 0; i < targetSongs.length; i += batchSize) {
          const batch = targetSongs.slice(i, i + batchSize);
          console.log(`Upserting batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(targetSongs.length / batchSize)} (${batch.length} songs)`);

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

        console.log(`Successfully upserted ${totalProcessed} songs to target`);
      } catch (error) {
        console.error("Error during batch upsert:", error);
        throw new Error(`Database upsert failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }

    const totalProcessed = mode === "only-upsert" ? updatedCount : importedCount;
    console.log(`Import completed: ${totalProcessed} songs processed, ${skippedCount} skipped`);

    return NextResponse.json({
      success: true,
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
    console.error("Error in admin import route:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

// Only allow GET requests
export async function POST() {
  return NextResponse.json(
    { error: "Method not allowed" },
    { status: 405 }
  );
}
