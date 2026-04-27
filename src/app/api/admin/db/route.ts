import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getEnabledRegions, isRegionEnabled } from "@/lib/enabled-regions";
import { Region } from "@/lib/types";
import { getCurrentVersion } from "@/lib/metadata";
import { normalizeName } from "@/lib/name-utils";
import { songs, userScores, userSnapshots, scoreData, snapshotScores, snapshotB50 } from "@/lib/db/schema-pg";
import { upsertScoreData } from "@/lib/maimai";
import { and, eq, inArray, asc, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

const log = logger.child({ module: "admin/db" });

const MODIFY_DATABASE = true;

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
    const type = (searchParams.get('type') || "normalize") as "normalize" | "backfill" | "clear_backfill";
    if (type === "normalize") {
      return normalize(searchParams);
    } else if (type === "backfill") {
      return backfillNewTables(searchParams);
    } else if (type === "clear_backfill") {
      return clearBackfill(searchParams);
    } else {
      return NextResponse.json(
        { error: "Invalid 'type' parameter. Must be 'normalize', 'backfill', or 'clear_backfill'" },
        { status: 400 }
      );
    }
  } catch (error) {
    log.error({ err: error }, "Error in admin db route");
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

async function normalize(searchParams: URLSearchParams) {
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

async function backfillNewTables(searchParams: URLSearchParams) {
  const region = searchParams.get('region') as "intl" | "jp" | null;
  const limitParam = searchParams.get('limit');
  const maxSnapshots = limitParam ? Math.max(1, parseInt(limitParam)) : Infinity;
  const SUB_BATCH_SIZE = 50;
  const FETCH_BATCH_SIZE = Math.min(500, maxSnapshots === Infinity ? 500 : maxSnapshots + 200); // Over-fetch to account for skips
  const CHUNK_SIZE = 2000;

  log.info({ region, maxSnapshots: maxSnapshots === Infinity ? "all" : maxSnapshots, subBatchSize: SUB_BATCH_SIZE, chunkSize: CHUNK_SIZE }, "Starting backfill of scoreData/snapshotScores/snapshotB50");

  let totalSnapshots = 0;
  let totalSkipped = 0;
  let totalScoreDataUpserted = 0;
  let totalJunctionRows = 0;
  let totalB50Rows = 0;
  let lastId = 0;

  while (totalSnapshots < maxSnapshots) {
    const conditions = [sql`${userSnapshots.id} > ${lastId}`];
    if (region) {
      conditions.push(eq(userSnapshots.region, region));
    }

    // Fetch a batch of snapshot IDs
    const snapshots = await db
      .select({ id: userSnapshots.id })
      .from(userSnapshots)
      .where(and(...conditions))
      .orderBy(asc(userSnapshots.id))
      .limit(FETCH_BATCH_SIZE);

    if (snapshots.length === 0) {
      log.debug({ lastId: lastId.toString() }, "No more snapshots to fetch");
      break;
    }

    const snapshotIds = snapshots.map(s => s.id);
    lastId = snapshotIds[snapshotIds.length - 1];
    log.debug({ fetched: snapshotIds.length, firstId: snapshotIds[0].toString(), lastId: lastId.toString() }, "Fetched snapshot batch");

    // Filter out already-backfilled snapshots
    const alreadyBackfilled = await db
      .selectDistinct({ snapshotId: snapshotScores.snapshotId })
      .from(snapshotScores)
      .where(inArray(snapshotScores.snapshotId, snapshotIds));

    const backfilledSet = new Set(alreadyBackfilled.map(r => r.snapshotId));
    let pendingIds = snapshotIds.filter(id => !backfilledSet.has(id));
    const batchSkipped = snapshotIds.length - pendingIds.length;
    totalSkipped += batchSkipped;
    log.debug({ pending: pendingIds.length, alreadyDone: batchSkipped }, "Filtered already-backfilled snapshots");

    // Cap to remaining limit
    const remaining = maxSnapshots - totalSnapshots;
    if (pendingIds.length > remaining) {
      log.debug({ pending: pendingIds.length, remaining }, "Capping to remaining limit");
      pendingIds = pendingIds.slice(0, remaining);
    }

    if (pendingIds.length === 0) {
      log.debug("No pending snapshots in this batch, continuing");
      continue;
    }

    const batchStart = Date.now();

    // Step 1: Fetch scores in parallel sub-batches (reads don't lock)
    const subBatches: number[][] = [];
    for (let i = 0; i < pendingIds.length; i += SUB_BATCH_SIZE) {
      subBatches.push(pendingIds.slice(i, i + SUB_BATCH_SIZE));
    }
    log.debug({ subBatchCount: subBatches.length, pendingSnapshots: pendingIds.length }, "Fetching scores in parallel sub-batches");

    const fetchStart = Date.now();
    const subBatchResults = await Promise.all(subBatches.map(async (subBatchIds, subIdx) => {
      const scores = await db
        .select({
          snapshotId: userScores.snapshotId,
          songId: userScores.songId,
          achievement: userScores.achievement,
          dxScore: userScores.dxScore,
          fc: userScores.fc,
          fs: userScores.fs,
          rank: userScores.rank,
        })
        .from(userScores)
        .where(inArray(userScores.snapshotId, subBatchIds));

      log.debug({ subBatch: subIdx, snapshots: subBatchIds.length, scores: scores.length }, "Fetched scores for sub-batch");
      return scores;
    }));
    const allScores = subBatchResults.flat();
    log.debug({ totalScores: allScores.length, fetchMs: Date.now() - fetchStart }, "All scores fetched");

    if (allScores.length === 0) {
      totalSnapshots += pendingIds.length;
      continue;
    }

    // Step 2: Single upsert into score_data (sorted internally, no deadlock risk)
    const upsertStart = Date.now();
    const scoreDataLookup = await upsertScoreData(
      allScores.map(s => ({
        songId: s.songId,
        achievement: s.achievement,
        dxScore: s.dxScore,
        fc: s.fc,
        fs: s.fs,
      }))
    );
    log.debug({ uniqueScoreData: scoreDataLookup.size, upsertMs: Date.now() - upsertStart }, "Upserted scoreData for batch");

    // Step 3: Build junction and B50 rows
    const junctionRows: { snapshotId: number; scoreId: number }[] = [];
    const b50Rows: { snapshotId: number; rank: number; scoreId: number }[] = [];
    let missingKeys = 0;

    for (const score of allScores) {
      const key = `${score.songId}-${score.achievement}-${score.dxScore}-${score.fc}-${score.fs}`;
      const scoreDataId = scoreDataLookup.get(key);
      if (!scoreDataId) {
        missingKeys++;
        continue;
      }

      junctionRows.push({ snapshotId: score.snapshotId, scoreId: scoreDataId });
      if (score.rank != null && score.rank < 50) {
        b50Rows.push({ snapshotId: score.snapshotId, rank: score.rank, scoreId: scoreDataId });
      }
    }

    if (missingKeys > 0) {
      log.warn({ missingKeys }, "Some scores had no matching scoreData key after upsert");
    }

    // Step 4: Insert junction + B50 in parallel (partitioned by snapshotId, no deadlock risk)
    const insertStart = Date.now();
    const insertPromises: Promise<unknown>[] = [];
    for (let i = 0; i < junctionRows.length; i += CHUNK_SIZE) {
      insertPromises.push(
        db.insert(snapshotScores).values(junctionRows.slice(i, i + CHUNK_SIZE)).onConflictDoNothing()
      );
    }
    for (let i = 0; i < b50Rows.length; i += CHUNK_SIZE) {
      insertPromises.push(
        db.insert(snapshotB50).values(b50Rows.slice(i, i + CHUNK_SIZE)).onConflictDoNothing()
      );
    }
    await Promise.all(insertPromises);
    log.debug({ junctionRows: junctionRows.length, b50Rows: b50Rows.length, insertChunks: insertPromises.length, insertMs: Date.now() - insertStart }, "Inserted junction + B50 rows");

    totalScoreDataUpserted += scoreDataLookup.size;
    totalJunctionRows += junctionRows.length;
    totalB50Rows += b50Rows.length;
    totalSnapshots += pendingIds.length;
    log.info({ backfilled: totalSnapshots, skipped: totalSkipped, lastId: lastId.toString(), junctionRows: totalJunctionRows, b50Rows: totalB50Rows, batchMs: Date.now() - batchStart }, "Backfill batch complete");
  }

  log.info({
    totalSnapshots,
    totalSkipped,
    totalScoreDataUpserted,
    totalJunctionRows,
    totalB50Rows,
    lastProcessedId: lastId.toString(),
  }, "Backfill complete");

  const done = totalSnapshots < maxSnapshots;

  return NextResponse.json({
    success: true,
    message: done ? "Backfill completed — all snapshots processed" : `Backfill batch done — processed ${totalSnapshots}/${maxSnapshots} limit, call again to continue`,
    done,
    statistics: {
      totalSnapshots,
      totalSkipped,
      totalScoreDataUpserted,
      totalJunctionRows,
      totalB50Rows,
      lastProcessedId: lastId.toString(),
    },
  });
}

async function clearBackfill(searchParams: URLSearchParams) {
  const region = searchParams.get('region') as "intl" | "jp" | null;

  log.info({ region }, "Clearing backfill data");

  if (region) {
    // Delete only for snapshots in this region
    const regionSnapshotIds = db
      .select({ id: userSnapshots.id })
      .from(userSnapshots)
      .where(eq(userSnapshots.region, region));

    const b50Deleted = await db.delete(snapshotB50)
      .where(inArray(snapshotB50.snapshotId, regionSnapshotIds))
      .returning({ snapshotId: snapshotB50.snapshotId });

    const junctionDeleted = await db.delete(snapshotScores)
      .where(inArray(snapshotScores.snapshotId, regionSnapshotIds))
      .returning({ snapshotId: snapshotScores.snapshotId });

    log.info({ region, junctionRowsDeleted: junctionDeleted.length, b50RowsDeleted: b50Deleted.length }, "Cleared backfill data for region");

    return NextResponse.json({
      success: true,
      message: `Cleared backfill data for region ${region}`,
      statistics: {
        junctionRowsDeleted: junctionDeleted.length,
        b50RowsDeleted: b50Deleted.length,
      },
    });
  } else {
    // Truncate all new tables
    await db.execute(sql`TRUNCATE TABLE snapshot_b50`);
    await db.execute(sql`TRUNCATE TABLE snapshot_scores`);
    // Don't truncate score_data — it may be referenced by dual-write snapshots
    // Orphaned score_data rows are harmless and cheap

    log.info("Truncated snapshot_scores and snapshot_b50");

    return NextResponse.json({
      success: true,
      message: "Cleared all backfill data (snapshot_scores and snapshot_b50 truncated)",
    });
  }
}
