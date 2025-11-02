import { db } from "@/lib/db";
import { getCurrentVersion } from "@/lib/metadata";
import { normalizeName } from "@/lib/name-utils";
import { splitSongs } from "@/lib/rating-calculator";
import { detailedScores, songs, userScores, userSnapshots } from "@/lib/schema";
import { SongWithScore } from "@/lib/types";
import { and, eq, inArray, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

const MODIFY_DATABASE = true;
const BATCH_SIZE = 10000;

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
    const type = (searchParams.get('type') || "normalize") as "normalize" | "update_b50";
    if (type === "normalize") {
      return normalize(searchParams);
    } else if (type === "update_b50") {
      return updateB50(searchParams);
    } else {
      return NextResponse.json(
        { error: "Invalid 'type' parameter. Must be 'normalize' or 'update_b50'" },
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

  console.log(`Admin update requested: updating database for region ${region}`);

  // We should get all songs, then try to normalize their names, then compare to the database
  // If there are duplicates, we must first merge the data to prevent data loss
  // Then we should update the database with the new data
  const currentVersion = getCurrentVersion(region);
  const allSongs = await db.select().from(songs).where(and(eq(songs.region, region), eq(songs.gameVersion, currentVersion)));
  const songsGrouped: Record<string, typeof allSongs | undefined> = Object.groupBy(allSongs, song => `${normalizeName(song.songName)}@${song.difficulty}@${song.type}` as string);
  const filteredSongsGrouped: Record<string, typeof allSongs> = Object.fromEntries(Object.entries(songsGrouped).filter(([_, value]) => value && value.length > 1).map(([key, value]) => [key, value!]));
  
  console.log("--- Starting Duplicate Song Merge Process ---");

  let index = 0;
  let totalDuplicatesMerged = 0;
  let totalMasterNamesNormalized = 0;

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

    await db.transaction(async (tx) => {
      try {
        // --- Phase 1: Relink children and delete actual duplicate song records ---
        if (duplicateIdsToCleanUp.length > 0) {
          // Update userScores
          console.log(`  Updating userScores and detailedScores referencing ${duplicateIdsToCleanUp.join(", ")} to ${masterSong.id}...`);
          if (MODIFY_DATABASE) {
            const [userScoresUpdateResult, detailedScoresUpdateResult] = await Promise.all([
              tx
                .update(userScores)
                .set({ songId: masterSong.id })
                .where(inArray(userScores.songId, duplicateIdsToCleanUp)),
              tx
                .update(detailedScores)
                .set({ songId: masterSong.id })
                .where(inArray(detailedScores.songId, duplicateIdsToCleanUp))
            ]);
            console.log(`    Updated ${userScoresUpdateResult.rowsAffected} userScores and ${detailedScoresUpdateResult.rowsAffected} detailedScores records.`);
          } else {
            console.log(`    [DRY RUN] Would update userScores and detailedScores referencing duplicates.`);
          }

          // Delete the duplicate songs records
          console.log(`  Deleting duplicate song records ${duplicateIdsToCleanUp.join(", ")} from 'songs' table...`);
          if (MODIFY_DATABASE) {
            const deleteSongsResult = await tx
              .delete(songs)
              .where(inArray(songs.id, duplicateIdsToCleanUp));
            console.log(`    Deleted ${deleteSongsResult.rowsAffected} duplicate song records.`);
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
              .where(eq(songs.id, masterSong.id));
            console.log(`    Updated ${masterNameUpdateResult.rowsAffected} master song name record.`);
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
    });
  }

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

async function updateB50(searchParams: URLSearchParams) {
  const region = searchParams.get('region') as "intl" | "jp";

  if (!region || (region !== "intl" && region !== "jp")) {
    return NextResponse.json(
      { error: "Missing or invalid 'region' query parameter. Must be 'intl' or 'jp'" },
      { status: 400 }
    );
  }

  console.log(`\n--- Starting B50 Rank Calculation for region: ${region} ---`);

  // Query all songs for the region separately (fast lookup by primary key)
  console.log("Fetching all songs for region...");
  const allSongs = await db
    .select()
    .from(songs)
    .where(eq(songs.region, region));
  
  console.log(`Fetched ${allSongs.length} songs`);

  // Create a lookup map by songId (primary key)
  const songLookup = new Map(allSongs.map(song => [song.id, song]));

  // Query all userScores with snapshot gameVersion
  console.log("Fetching all user scores...");
  const allScores = await db
    .select({
      scoreId: userScores.id,
      snapshotId: userScores.snapshotId,
      songId: userScores.songId,
      currentRank: userScores.rank,
      achievement: userScores.achievement,
      dxScore: userScores.dxScore,
      fc: userScores.fc,
      fs: userScores.fs,
      gameVersion: userSnapshots.gameVersion,
    })
    .from(userScores)
    .innerJoin(userSnapshots, eq(userScores.snapshotId, userSnapshots.id))
    .where(eq(userSnapshots.region, region));

  console.log(`Fetched ${allScores.length} user scores`);

  // Combine scores with song data using lookup
  const allScoresWithData = allScores.map(score => {
    const song = songLookup.get(score.songId);
    if (!song) {
      throw new Error(`Song not found for songId: ${score.songId}`);
    }
    return {
      ...score,
      songName: song.songName,
      artist: song.artist,
      cover: song.cover,
      difficulty: song.difficulty,
      level: song.level,
      levelPrecise: song.levelPrecise,
      type: song.type,
      genre: song.genre,
      addedVersion: song.addedVersion,
    };
  });

  // Group by snapshotId
  const scoresBySnapshot = new Map<string, typeof allScoresWithData>();
  for (const score of allScoresWithData) {
    if (!scoresBySnapshot.has(score.snapshotId)) {
      scoresBySnapshot.set(score.snapshotId, []);
    }
    scoresBySnapshot.get(score.snapshotId)!.push(score);
  }

  console.log(`Grouped scores into ${scoresBySnapshot.size} snapshots`);

  // Find snapshots that need recalculation (have any null ranks)
  const snapshotsToRecalculate: string[] = [];
  for (const [snapshotId, scores] of scoresBySnapshot.entries()) {
    if (scores.some(s => s.currentRank === null)) {
      snapshotsToRecalculate.push(snapshotId);
    }
  }

  console.log(`Found ${snapshotsToRecalculate.length} snapshots needing recalculation`);

  if (snapshotsToRecalculate.length === 0) {
    console.log("No snapshots need recalculation. Exiting.");
    return NextResponse.json({
      success: true,
      message: "No snapshots needed rank recalculation",
      statistics: {
        totalSnapshots: scoresBySnapshot.size,
        snapshotsRecalculated: 0,
        scoresUpdated: 0,
      },
    });
  }

  // Calculate ranks for snapshots that need it
  const updates: Array<{ id: string; rank: number }> = [];

  for (const snapshotId of snapshotsToRecalculate) {
    const scores = scoresBySnapshot.get(snapshotId)!;
    const gameVersion = scores[0].gameVersion; // All scores in a snapshot have the same gameVersion

    // Convert to SongWithScore format for rating calculation
    const songsForCalculation: SongWithScore[] = scores.map(score => ({
      songId: score.songId,
      songName: score.songName,
      artist: score.artist,
      cover: score.cover,
      difficulty: score.difficulty as any,
      level: score.level,
      levelPrecise: score.levelPrecise,
      type: score.type as any,
      genre: score.genre,
      addedVersion: score.addedVersion,
      achievement: score.achievement,
      dxScore: score.dxScore,
      fc: score.fc as any,
      fs: score.fs as any,
    }));

    // Use splitSongs to get B15 and B35
    const { newSongsB15, oldSongsB35, newSongsRemaining, oldSongsRemaining } = splitSongs(songsForCalculation, gameVersion);

    // Assign ranks
    // New B15: ranks 0-14
    for (let i = 0; i < newSongsB15.length; i++) {
      const song = newSongsB15[i];
      const scoreRecord = scores.find(s => 
        s.songId === song.songId && 
        s.difficulty === song.difficulty
      );
      if (scoreRecord) {
        updates.push({ id: scoreRecord.scoreId, rank: i });
      }
    }

    // Old B35: ranks 15-49
    for (let i = 0; i < oldSongsB35.length; i++) {
      const song = oldSongsB35[i];
      const scoreRecord = scores.find(s => 
        s.songId === song.songId && 
        s.difficulty === song.difficulty
      );
      if (scoreRecord) {
        updates.push({ id: scoreRecord.scoreId, rank: 15 + i });
      }
    }

    // Remaining songs: merge and sort by rating desc, start from rank 50
    const remainingSongs = [...newSongsRemaining, ...oldSongsRemaining].sort((a, b) => b.rating - a.rating);
    for (let i = 0; i < remainingSongs.length; i++) {
      const song = remainingSongs[i];
      const scoreRecord = scores.find(s => 
        s.songId === song.songId && 
        s.difficulty === song.difficulty
      );
      if (scoreRecord) {
        updates.push({ id: scoreRecord.scoreId, rank: 50 + i });
      }
    }
  }

  console.log(`Calculated ranks for ${updates.length} scores`);

  // Batch update in a single transaction
  let totalUpdated = 0;

  try {
    if (MODIFY_DATABASE) {
      await db.transaction(async (tx) => {
        let batchIndex = 0;
        
        for (let i = 0; i < updates.length; i += BATCH_SIZE) {
          const batch = updates.slice(i, i + BATCH_SIZE);
          batchIndex++;
          
          console.log(`Processing batch ${batchIndex}/${Math.ceil(updates.length / BATCH_SIZE)} (${batch.length} updates)...`);

          // Build CASE statement for batch update
          const caseStatements = batch.map(
            update => sql`WHEN ${userScores.id} = ${update.id} THEN ${update.rank}`
          );
          
          const ids = batch.map(update => update.id);
          
          // Single UPDATE with CASE for the entire batch
          await tx
            .update(userScores)
            .set({
              rank: sql`CASE ${sql.join(caseStatements, sql.raw(' '))} END`
            })
            .where(inArray(userScores.id, ids));

          totalUpdated += batch.length;
          console.log(`  Successfully updated batch ${batchIndex} (${totalUpdated}/${updates.length} total)`);
        }
      });
    } else {
      console.log(`[DRY RUN] Would update ${updates.length} scores in ${Math.ceil(updates.length / BATCH_SIZE)} batches`);
      totalUpdated = updates.length;
    }
  } catch (error) {
    console.error(`Error during batch update:`, error);
    return NextResponse.json(
      { 
        error: `Failed to update ranks: ${error instanceof Error ? error.message : "Unknown error"}`,
        statistics: {
          totalSnapshots: scoresBySnapshot.size,
          snapshotsRecalculated: snapshotsToRecalculate.length,
          scoresUpdated: totalUpdated,
          scoresFailed: updates.length - totalUpdated,
        }
      },
      { status: 500 }
    );
  }

  console.log(`\n--- B50 Rank Calculation Complete ---`);
  console.log(`Total snapshots: ${scoresBySnapshot.size}`);
  console.log(`Snapshots recalculated: ${snapshotsToRecalculate.length}`);
  console.log(`Scores updated: ${totalUpdated}`);

  return NextResponse.json({
    success: true,
    message: "B50 rank calculation completed successfully",
    statistics: {
      totalSnapshots: scoresBySnapshot.size,
      snapshotsRecalculated: snapshotsToRecalculate.length,
      scoresUpdated: totalUpdated,
    },
  });
}