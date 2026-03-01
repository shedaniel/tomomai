import { db } from "@/lib/db";
import { getCurrentVersion } from "@/lib/metadata";
import { normalizeName } from "@/lib/name-utils";
import { songs, userScores, userSnapshots, scoreData, snapshotScores, snapshotB50 } from "@/lib/db/schema-pg";
import { upsertScoreData } from "@/lib/maimai-fetcher";
import { and, eq, inArray, asc, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

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
    const type = (searchParams.get('type') || "normalize") as "normalize" | "backfill";
    if (type === "normalize") {
      return normalize(searchParams);
    } else if (type === "backfill") {
      return backfillNewTables(searchParams);
    } else {
      return NextResponse.json(
        { error: "Invalid 'type' parameter. Must be 'normalize' or 'backfill'" },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("Error in admin db route:", error);
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
  const region = searchParams.get('region') as "intl" | "jp";

  if (!region || (region !== "intl" && region !== "jp")) {
    return NextResponse.json(
      { error: "Missing or invalid 'region' query parameter. Must be 'intl' or 'jp'" },
      { status: 400 }
    );
  }

  // We should get all songs, then try to normalize their names, then compare to the database
  // If there are duplicates, we must first merge the data to prevent data loss
  // Then we should update the database with the new data
  const version = searchParams.get('version') as string | null;
  const currentVersion = version ? parseInt(version) : getCurrentVersion(region);

  console.log(`Admin update requested: updating database for region ${region} version ${currentVersion}`);

  const allSongs = await db.select().from(songs).where(and(eq(songs.region, region), eq(songs.gameVersion, currentVersion)));
  const songsGrouped: Record<string, typeof allSongs | undefined> = Object.groupBy(allSongs, song => `${normalizeName(song.songName)}@${song.difficulty}@${song.type}` as string);
  const filteredSongsGrouped: Record<string, typeof allSongs> = Object.fromEntries(Object.entries(songsGrouped).filter(([_, value]) => value && (value.length > 1 || normalizeName(value[0].songName) !== value[0].songName)).map(([key, value]) => [key, value!]));

  console.log("--- Starting Duplicate Song Merge Process ---");

  let index = 0;
  let totalDuplicatesMerged = 0;
  let totalMasterNamesNormalized = 0;

  const promises: Promise<void>[] = [];

  for (const [groupKey, duplicateSongRecords] of Object.entries(filteredSongsGrouped)) {
    console.log(`\nFound duplicates for key: "${groupKey}" (${index + 1}/${Object.entries(filteredSongsGrouped).length})`);
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
      console.log("  No actual duplicates to delete and master name already normalized. Skipping group.");
      continue;
    }

    console.log(`  Master Song ID: ${masterSong.id} (Original Name: "${masterSong.songName}")`);
    if (duplicateIdsToCleanUp.length > 0) {
      console.log(`  Duplicate Song IDs to merge/delete: ${duplicateIdsToCleanUp.join(", ")}`);
    }

    promises.push(db.transaction(async (tx) => {
      try {
        // --- Phase 1: Relink children and delete actual duplicate song records ---
        if (duplicateIdsToCleanUp.length > 0) {
          // Update userScores
          console.log(`  Updating userScores referencing ${duplicateIdsToCleanUp.join(", ")} to ${masterSong.id}...`);
          if (MODIFY_DATABASE) {
            const userScoresUpdateResult = await tx
              .update(userScores)
              .set({ songId: masterSong.id })
              .where(inArray(userScores.songId, duplicateIdsToCleanUp))
              .returning({ id: userScores.id });
            console.log(`    Updated ${userScoresUpdateResult.length} userScores records.`);
          } else {
            console.log(`    [DRY RUN] Would update userScores referencing duplicates.`);
          }

          // Update scoreData — handle unique constraint conflicts by deleting duplicates
          console.log(`  Updating scoreData referencing ${duplicateIdsToCleanUp.join(", ")} to ${masterSong.id}...`);
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

            const idsToRelink: bigint[] = [];
            const idsToDelete: bigint[] = [];
            const relinkMap = new Map<bigint, bigint>(); // old scoreData id -> master scoreData id

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
              console.log(`    Deleted ${idsToDelete.length} conflicting scoreData rows.`);
            }

            // Update non-conflicting rows to master songId
            if (idsToRelink.length > 0) {
              await tx
                .update(scoreData)
                .set({ songId: masterSong.id })
                .where(inArray(scoreData.id, idsToRelink));
              console.log(`    Relinked ${idsToRelink.length} scoreData rows.`);
            }
          }

          // Delete the duplicate songs records
          console.log(`  Deleting duplicate song records ${duplicateIdsToCleanUp.join(", ")} from 'songs' table...`);
          if (MODIFY_DATABASE) {
            const deleteSongsResult = await tx
              .delete(songs)
              .where(inArray(songs.id, duplicateIdsToCleanUp))
              .returning({ id: songs.id });
            console.log(`    Deleted ${deleteSongsResult.length} duplicate song records.`);
          } else {
            console.log(`    [DRY RUN] Would delete ${duplicateIdsToCleanUp.length} duplicate song records.`);
          }

          totalDuplicatesMerged += duplicateIdsToCleanUp.length;
        }

        // --- Phase 2: Normalize master song's name (after duplicates are gone) ---
        if (shouldUpdateMasterName) {
          console.log(`  Normalizing master song's name from "${masterSong.songName}" to "${normalizedSongName}" (ID: ${masterSong.id})...`);
          if (MODIFY_DATABASE) {
            const masterNameUpdateResult = await tx
              .update(songs)
              .set({ songName: normalizedSongName })
              .where(eq(songs.id, masterSong.id))
              .returning({ id: songs.id });
            console.log(`    Updated ${masterNameUpdateResult.length} master song name record.`);
          } else {
            console.log(`    [DRY RUN] Would update master song name.`);
          }
          totalMasterNamesNormalized++;
        }

        console.log(`  Successfully processed group for key: "${groupKey}"`);
      } catch (error) {
        console.error(`  Error processing group "${groupKey}":`, error);
        throw error; // Re-throw to ensure transaction is rolled back
      }
    }));
  }

  await Promise.all(promises);

  console.log(`\n--- Duplicate Song Merge Process Complete ---`);
  console.log(`Total duplicate song records merged/deleted: ${totalDuplicatesMerged}`);
  console.log(`Total master song names normalized: ${totalMasterNamesNormalized}`);

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
  const startFromId = searchParams.get('startFromId');
  const BATCH_SIZE = 50;

  console.log(`\n--- Starting backfill of scoreData/snapshotScores/snapshotB50 ---`);
  if (region) console.log(`  Region filter: ${region}`);
  if (startFromId) console.log(`  Starting from snapshot id > ${startFromId}`);

  // Fetch snapshots in batches
  let lastId = startFromId ? BigInt(startFromId) : BigInt(0);
  let totalSnapshots = 0;
  let totalScoreDataUpserted = 0;
  let totalJunctionRows = 0;
  let totalB50Rows = 0;

  while (true) {
    const conditions = [sql`${userSnapshots.id} > ${lastId}`];
    if (region) {
      conditions.push(eq(userSnapshots.region, region));
    }

    const snapshots = await db
      .select({ id: userSnapshots.id })
      .from(userSnapshots)
      .where(and(...conditions))
      .orderBy(asc(userSnapshots.id))
      .limit(BATCH_SIZE);

    if (snapshots.length === 0) break;

    const snapshotIds = snapshots.map(s => s.id);

    // Fetch all scores for this batch of snapshots
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
      .where(inArray(userScores.snapshotId, snapshotIds));

    if (scores.length > 0) {
      // Upsert scoreData
      const scoreDataLookup = await upsertScoreData(
        scores.map(s => ({
          songId: s.songId,
          achievement: s.achievement,
          dxScore: s.dxScore,
          fc: s.fc,
          fs: s.fs,
        }))
      );

      totalScoreDataUpserted += scoreDataLookup.size;

      // Build junction and B50 rows
      const junctionRows: { snapshotId: bigint; scoreId: bigint }[] = [];
      const b50Rows: { snapshotId: bigint; rank: number; scoreId: bigint }[] = [];

      for (const score of scores) {
        const key = `${score.songId}-${score.achievement}-${score.dxScore}-${score.fc}-${score.fs}`;
        const scoreDataId = scoreDataLookup.get(key);
        if (!scoreDataId) continue;

        junctionRows.push({ snapshotId: score.snapshotId, scoreId: scoreDataId });
        if (score.rank != null && score.rank < 50) {
          b50Rows.push({ snapshotId: score.snapshotId, rank: score.rank, scoreId: scoreDataId });
        }
      }

      // Insert junction rows in chunks
      for (let i = 0; i < junctionRows.length; i += 1000) {
        await db.insert(snapshotScores).values(junctionRows.slice(i, i + 1000)).onConflictDoNothing();
      }

      // Insert B50 rows in chunks
      for (let i = 0; i < b50Rows.length; i += 1000) {
        await db.insert(snapshotB50).values(b50Rows.slice(i, i + 1000)).onConflictDoNothing();
      }

      totalJunctionRows += junctionRows.length;
      totalB50Rows += b50Rows.length;
    }

    totalSnapshots += snapshots.length;
    lastId = snapshots[snapshots.length - 1].id;
    console.log(`  Processed batch: ${totalSnapshots} snapshots so far (last id: ${lastId})`);
  }

  console.log(`\n--- Backfill Complete ---`);
  console.log(`Total snapshots processed: ${totalSnapshots}`);
  console.log(`Score data entries (unique): ${totalScoreDataUpserted}`);
  console.log(`Junction rows inserted: ${totalJunctionRows}`);
  console.log(`B50 rows inserted: ${totalB50Rows}`);

  return NextResponse.json({
    success: true,
    message: "Backfill completed successfully",
    statistics: {
      totalSnapshots,
      totalScoreDataUpserted,
      totalJunctionRows,
      totalB50Rows,
      lastProcessedId: lastId.toString(),
    },
  });
}
