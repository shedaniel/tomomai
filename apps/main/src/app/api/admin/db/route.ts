import { db } from "@/lib/db";
import { flushLogger } from "@/lib/logger";
import { requestLogger } from "@/lib/request-logger";
import { getEnabledRegions, isRegionEnabled } from "@/lib/enabled-regions";
import { Region } from "@/lib/types";
import { getCurrentVersion } from "@/lib/metadata";
import { normalizeName } from "@/lib/name-utils";
import { songs, scoreData } from "@/lib/db/schema-pg";
import { and, eq, inArray, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import type { Logger } from "pino";

const MODIFY_DATABASE = true;

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

  // We should get all songs, then try to normalize their names, then compare to the database
  // If there are duplicates, we must first merge the data to prevent data loss
  // Then we should update the database with the new data
  const version = searchParams.get('version') as string | null;
  const currentVersion = version ? parseInt(version) : getCurrentVersion(region);

  log.info({ region, version: currentVersion }, "Admin normalize requested");

  const allSongs = await db.select().from(songs).where(and(eq(songs.region, region), eq(songs.gameVersion, currentVersion)));
  const songsGrouped: Record<string, typeof allSongs | undefined> = Object.groupBy(allSongs, song => `${normalizeName(song.songName)}@${song.difficulty}@${song.type}` as string);
  const filteredSongsGrouped: Record<string, typeof allSongs> = Object.fromEntries(Object.entries(songsGrouped).filter(([_, value]) => value && (value.length > 1 || normalizeName(value[0].songName) !== value[0].songName)).map(([key, value]) => [key, value!]));

  log.info({ groupCount: Object.keys(filteredSongsGrouped).length }, "Starting duplicate song merge process");

  let index = 0;
  let totalDuplicatesMerged = 0;
  let totalMasterNamesNormalized = 0;

  const promises: Promise<void>[] = [];

  for (const [groupKey, duplicateSongRecords] of Object.entries(filteredSongsGrouped)) {
    log.info({ groupKey, progress: `${index + 1}/${Object.keys(filteredSongsGrouped).length}` }, "Processing duplicate group");
    index++;
    const masterSong = duplicateSongRecords[0]; // Choose the first record as the master
    const normalizedSongName = normalizeName(masterSong.songName);

    // Filter out the master song from the list of IDs to be considered for deletion
    const duplicateIdsToCleanUp = duplicateSongRecords
      .slice(1) // All but the first are actual duplicates
      .map((s) => s.id);

    // Check if the master song's name needs normalization
    const shouldUpdateMasterName = masterSong.songName !== normalizedSongName;

    if (duplicateIdsToCleanUp.length === 0 && !shouldUpdateMasterName) {
      log.debug({ groupKey }, "Skipping group — no duplicates and name already normalized");
      continue;
    }

    log.debug({ masterSongId: masterSong.id.toString(), originalName: masterSong.songName, duplicateIds: duplicateIdsToCleanUp.map(String) }, "Merging duplicates");

    promises.push(db.transaction(async (tx) => {
      try {
        // --- Phase 1: Relink children and delete actual duplicate song records ---
        if (duplicateIdsToCleanUp.length > 0) {
          // Update scoreData — handle unique constraint conflicts by deleting duplicates
          if (MODIFY_DATABASE) {
            // First, find scoreData rows that would conflict after update
            const duplicateScoreDataRows = await tx
              .select({ id: scoreData.id, songId: scoreData.songId, achievement: scoreData.achievement, dxScore: scoreData.dxScore, fc: scoreData.fc, fs: scoreData.fs })
              .from(scoreData)
              .where(inArray(scoreData.songId, duplicateIdsToCleanUp));

            const masterScoreDataRows = await tx
              .select({ id: scoreData.id, songId: scoreData.songId, achievement: scoreData.achievement, dxScore: scoreData.dxScore, fc: scoreData.fc, fs: scoreData.fs })
              .from(scoreData)
              .where(eq(scoreData.songId, masterSong.id));

            // Build a set of existing master keys
            const masterKeys = new Set(masterScoreDataRows.map(r => `${r.achievement}-${r.dxScore}-${r.fc}-${r.fs}`));

            const idsToRelink: number[] = [];
            const idsToDelete: number[] = [];
            const relinkMap = new Map<number, number>(); // old scoreData id -> master scoreData id

            for (const dupRow of duplicateScoreDataRows) {
              const key = `${dupRow.achievement}-${dupRow.dxScore}-${dupRow.fc}-${dupRow.fs}`;
              if (masterKeys.has(key)) {
                // Conflict: find the master row to remap references
                const masterRow = masterScoreDataRows.find(r =>
                  r.achievement === dupRow.achievement && r.dxScore === dupRow.dxScore && r.fc === dupRow.fc && r.fs === dupRow.fs
                )!;
                relinkMap.set(dupRow.id, masterRow.id);
                idsToDelete.push(dupRow.id);
              } else {
                idsToRelink.push(dupRow.id);
                masterKeys.add(key); // Prevent future conflicts within the same batch
              }
            }

            // Relink snapshotScores and snapshotB50 for conflicting rows
            for (const [oldId, newId] of relinkMap) {
              // Update snapshotScores: change scoreId, ignore conflicts (the master score might already be linked)
              await tx.execute(sql`UPDATE snapshot_scores SET "scoreId" = ${newId} WHERE "scoreId" = ${oldId} ON CONFLICT DO NOTHING`);
              // Update snapshotB50
              await tx.execute(sql`UPDATE snapshot_b50 SET "scoreId" = ${newId} WHERE "scoreId" = ${oldId} ON CONFLICT DO NOTHING`);
            }

            // Delete conflicting scoreData rows (cascades will clean up remaining refs)
            if (idsToDelete.length > 0) {
              await tx.delete(scoreData).where(inArray(scoreData.id, idsToDelete));
              log.debug({ count: idsToDelete.length }, "Deleted conflicting scoreData rows");
            }

            // Update non-conflicting rows to master songId
            if (idsToRelink.length > 0) {
              await tx
                .update(scoreData)
                .set({ songId: masterSong.id })
                .where(inArray(scoreData.id, idsToRelink));
              log.debug({ count: idsToRelink.length }, "Relinked scoreData rows");
            }
          }

          // Delete the duplicate songs records
          if (MODIFY_DATABASE) {
            const deleteSongsResult = await tx
              .delete(songs)
              .where(inArray(songs.id, duplicateIdsToCleanUp))
              .returning({ id: songs.id });
            log.debug({ count: deleteSongsResult.length }, "Deleted duplicate song records");
          } else {
            log.debug({ count: duplicateIdsToCleanUp.length }, "[DRY RUN] Would delete duplicate song records");
          }

          totalDuplicatesMerged += duplicateIdsToCleanUp.length;
        }

        // --- Phase 2: Normalize master song's name (after duplicates are gone) ---
        if (shouldUpdateMasterName) {
          if (MODIFY_DATABASE) {
            const masterNameUpdateResult = await tx
              .update(songs)
              .set({ songName: normalizedSongName })
              .where(eq(songs.id, masterSong.id))
              .returning({ id: songs.id });
            log.debug({ songId: masterSong.id.toString(), from: masterSong.songName, to: normalizedSongName, count: masterNameUpdateResult.length }, "Normalized master song name");
          } else {
            log.debug({ from: masterSong.songName, to: normalizedSongName }, "[DRY RUN] Would normalize master song name");
          }
          totalMasterNamesNormalized++;
        }

        log.debug({ groupKey }, "Successfully processed group");
      } catch (error) {
        log.error({ err: error, groupKey }, "Error processing duplicate group");
        throw error; // Re-throw to ensure transaction is rolled back
      }
    }));
  }

  await Promise.all(promises);

  log.info({ totalDuplicatesMerged, totalMasterNamesNormalized }, "Duplicate song merge process complete");

  return NextResponse.json({
    success: true,
    message: "Song data normalization completed",
    statistics: {
      totalDuplicatesMerged,
      totalMasterNamesNormalized,
    },
  });
}
