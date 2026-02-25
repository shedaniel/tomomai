import { db } from "@/lib/db";
import { songs, userScores } from "@/lib/db/schema-pg";
import { logger } from "@/lib/logger";
import { VersionId } from "@/lib/metadata";
import { Difficulty, Region, SongType } from "@/lib/types";
import { UpdateSong } from "@/lib/types/update";
import { mergeSongs, taker, merger, key, MergeSink } from "@/server/services/admin/fetcher-utils";
import { important, PendingSong, value, Pending } from "@/server/utils/admin/type";
import { sendDiscordWebhook } from "@/server/services/admin/discord-webhooks";
import { and, eq, inArray, count, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { NextRequest, NextResponse } from "next/server";

export type FieldChange = {
  field: string;
  oldValue: any;
  newValue: any;
};

export type AddedChange = {
  songKey: string;
  songName: string;
  difficulty: Difficulty;
  type: SongType;
  level: string;
  artist: string;
};

export type ModifiedChange = {
  songKey: string;
  songName: string;
  difficulty: Difficulty;
  type: SongType;
  fieldChanges: FieldChange[];
  dbId: string;
};

export type DeletedChange = {
  songKey: string;
  songName: string;
  difficulty: Difficulty;
  type: SongType;
  level: string;
  artist: string;
  dbId: string;
  playRecordCount?: number;
};

type ChangeAnalysis = {
  added: AddedChange[];
  modified: ModifiedChange[];
  deleted: DeletedChange[];
  unchanged: string[];
};

type DBSongType = typeof songs.$inferSelect;

type MergeEvent = {
  existing: PendingSong;
  incoming: PendingSong;
  result: PendingSong;
};

/**
 * Convert UpdateSong to PendingSong with all fields marked as important
 */
function convertUpdateSongToPendingSong(song: UpdateSong): PendingSong {
  return {
    songName: song.songName,
    type: song.type,
    difficulty: song.difficulty,
    artist: important(song.artist),
    cover: important(song.cover),
    level: important(song.level),
    levelPrecise: important(song.levelPrecise),
    genre: important(song.genre),
    addedVersion: important(song.addedVersion as VersionId),
    bpm: song.bpm !== null ? important(song.bpm) : undefined,
    noteDesigner: song.noteDesigner !== null ? important(song.noteDesigner) : undefined,
    noteCounts: song.noteCounts !== null ? important(song.noteCounts) : undefined,
    extras: { source: "upload" }
  };
}

/**
 * Convert DB Song to PendingSong without marking fields as important
 */
function convertDbSongToPendingSong(dbSong: DBSongType): PendingSong {
  return {
    songName: dbSong.songName,
    type: dbSong.type,
    difficulty: dbSong.difficulty,
    artist: dbSong.artist,
    cover: dbSong.cover,
    level: dbSong.level,
    levelPrecise: dbSong.levelPrecise,
    genre: dbSong.genre,
    addedVersion: dbSong.addedVersion as VersionId,
    bpm: dbSong.bpm ?? undefined,
    noteDesigner: dbSong.noteDesigner ?? undefined,
    noteCounts: dbSong.tapCount !== null ? {
      tap: dbSong.tapCount!,
      hold: dbSong.holdCount!,
      slide: dbSong.slideCount!,
      touch: dbSong.touchCount!,
      break: dbSong.breakCount!
    } : undefined,
    extras: {
      dbId: dbSong.id.toString(),
      source: "database"
    }
  };
}

/**
 * Compare two PendingSong objects and return field changes
 */
function compareFields(dbSong: PendingSong, mergedSong: PendingSong): FieldChange[] {
  const changes: FieldChange[] = [];

  const fields: Array<keyof PendingSong> = [
    "artist", "cover", "level", "levelPrecise", "genre",
    "addedVersion", "bpm", "noteDesigner", "noteCounts"
  ];

  for (const field of fields) {
    const dbValue = value(dbSong[field] as Pending<any>);
    const mergedValue = value(mergedSong[field] as Pending<any>);

    if (field === "noteCounts") {
      if (JSON.stringify(dbValue) !== JSON.stringify(mergedValue)) {
        changes.push({ field, oldValue: dbValue, newValue: mergedValue });
      }
    } else {
      if (dbValue !== mergedValue) {
        changes.push({ field, oldValue: dbValue, newValue: mergedValue });
      }
    }
  }

  return changes;
}

/**
 * Analyze changes using merge events collected via sink callbacks.
 */
function analyzeChanges(
  dbPendingSongs: PendingSong[],
  mergeEvents: MergeEvent[],
  addedSongs: PendingSong[]
): ChangeAnalysis {
  const added: AddedChange[] = addedSongs.map(song => ({
    songKey: key(song),
    songName: song.songName,
    difficulty: song.difficulty,
    type: song.type,
    level: value(song.level),
    artist: value(song.artist) || ""
  }));

  const modified: ModifiedChange[] = [];
  const unchanged: string[] = [];
  const mergedDbIds = new Set<string>();

  for (const { existing, result } of mergeEvents) {
    const dbId = existing.extras?.dbId;
    if (dbId) mergedDbIds.add(String(dbId));

    const fieldChanges = compareFields(existing, result);
    if (fieldChanges.length > 0) {
      modified.push({
        songKey: key(result),
        songName: result.songName,
        difficulty: result.difficulty,
        type: result.type,
        fieldChanges,
        dbId: String(existing.extras?.dbId ?? "")
      });
    } else {
      unchanged.push(key(result));
    }
  }

  const deleted: DeletedChange[] = [];
  for (const dbSong of dbPendingSongs) {
    const dbId = dbSong.extras?.dbId;
    const dbIdStr = dbId ? String(dbId) : undefined;
    if (dbIdStr && !mergedDbIds.has(dbIdStr)) {
      deleted.push({
        songKey: key(dbSong),
        songName: dbSong.songName,
        difficulty: dbSong.difficulty,
        type: dbSong.type,
        level: value(dbSong.level),
        artist: value(dbSong.artist) || "",
        dbId: dbIdStr
      });
    }
  }

  return { added, modified, deleted, unchanged };
}

type UpdateMode = "noop" | "alter" | "destructive";

function pendingSongToDbValues(song: PendingSong, region: Region, gameVersion: VersionId) {
  const noteCounts = value(song.noteCounts as Pending<any>);
  return {
    publicId: nanoid(),
    songName: song.songName,
    artist: value(song.artist as Pending<any>) ?? "",
    cover: value(song.cover as Pending<any>) ?? "",
    difficulty: song.difficulty,
    level: value(song.level as Pending<any>),
    levelPrecise: value(song.levelPrecise as Pending<any>),
    type: song.type,
    genre: value(song.genre as Pending<any>) ?? "",
    region,
    gameVersion,
    addedVersion: value(song.addedVersion as Pending<any>),
    bpm: value(song.bpm as Pending<any>) ?? null,
    noteDesigner: value(song.noteDesigner as Pending<any>) ?? null,
    tapCount: noteCounts?.tap ?? null,
    holdCount: noteCounts?.hold ?? null,
    slideCount: noteCounts?.slide ?? null,
    touchCount: noteCounts?.touch ?? null,
    breakCount: noteCounts?.break ?? null,
  };
}

async function applyChanges(
  changes: ChangeAnalysis,
  addedSongs: PendingSong[],
  mergeEvents: MergeEvent[],
  region: Region,
  version: VersionId,
  mode: UpdateMode
): Promise<{ added: number; modified: number; deleted: number }> {
  if (mode === "noop") return { added: 0, modified: 0, deleted: 0 };

  const deletedToApply = mode === "destructive"
    ? changes.deleted
    : changes.deleted.filter(d => (d.playRecordCount ?? 0) === 0);

  let appliedAdded = 0;
  let appliedModified = 0;
  let appliedDeleted = 0;

  // Update modified songs
  if (mergeEvents.length > 0) {
    const modifiedRows = mergeEvents
      .filter(({ existing }) => existing.extras?.dbId)
      .map(({ result }) => pendingSongToDbValues(result, region, version));

    const batchSize = 1000;
    for (let i = 0; i < modifiedRows.length; i += batchSize) {
      const batch = modifiedRows.slice(i, i + batchSize);
      await db.insert(songs).values(batch).onConflictDoUpdate({
        target: [songs.songName, songs.difficulty, songs.type, songs.region, songs.gameVersion, songs.addedVersion],
        set: {
          artist: sql`excluded.artist`,
          cover: sql`excluded.cover`,
          level: sql`excluded.level`,
          levelPrecise: sql`excluded."levelPrecise"`,
          genre: sql`excluded.genre`,
          addedVersion: sql`excluded."addedVersion"`,
          bpm: sql`excluded.bpm`,
          noteDesigner: sql`excluded."noteDesigner"`,
          tapCount: sql`excluded."tapCount"`,
          holdCount: sql`excluded."holdCount"`,
          slideCount: sql`excluded."slideCount"`,
          touchCount: sql`excluded."touchCount"`,
          breakCount: sql`excluded."breakCount"`,
        },
      });
      appliedModified += batch.length;
    }
  }

  // Insert added songs
  if (addedSongs.length > 0) {
    const rows = addedSongs.map(song => pendingSongToDbValues(song, region, version));
    const batchSize = 1000;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      await db.insert(songs).values(batch).onConflictDoUpdate({
        target: [songs.songName, songs.difficulty, songs.type, songs.region, songs.gameVersion, songs.addedVersion],
        set: {
          artist: sql`excluded.artist`,
          cover: sql`excluded.cover`,
          level: sql`excluded.level`,
          levelPrecise: sql`excluded."levelPrecise"`,
          genre: sql`excluded.genre`,
          addedVersion: sql`excluded."addedVersion"`,
          bpm: sql`excluded.bpm`,
          noteDesigner: sql`excluded."noteDesigner"`,
          tapCount: sql`excluded."tapCount"`,
          holdCount: sql`excluded."holdCount"`,
          slideCount: sql`excluded."slideCount"`,
          touchCount: sql`excluded."touchCount"`,
          breakCount: sql`excluded."breakCount"`,
        },
      });
      appliedAdded += batch.length;
    }
  }

  // Delete songs
  if (deletedToApply.length > 0) {
    const batchSize = 1000;
    for (let i = 0; i < deletedToApply.length; i += batchSize) {
      const batch = deletedToApply.slice(i, i + batchSize);
      const batchIds = batch.map(d => BigInt(d.dbId));
      await db.delete(songs).where(inArray(songs.id, batchIds));
      appliedDeleted += batch.length;
    }
  }

  return { added: appliedAdded, modified: appliedModified, deleted: appliedDeleted };
}

export async function POST(request: NextRequest) {
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
    const region = searchParams.get('region') as Region;
    const versionParam = searchParams.get('version');
    const updateParam = searchParams.get('update');
    const updateMode: UpdateMode = (updateParam === "alter" || updateParam === "destructive" || updateParam === "noop")
      ? updateParam
      : "noop";

    if (!region || (region !== "intl" && region !== "jp")) {
      return NextResponse.json(
        { error: "Missing or invalid 'region' query parameter. Must be 'intl' or 'jp'" },
        { status: 400 }
      );
    }

    if (!versionParam) {
      return NextResponse.json(
        { error: "Missing 'version' query parameter" },
        { status: 400 }
      );
    }

    const version = parseInt(versionParam, 10) as VersionId;
    if (isNaN(version)) {
      return NextResponse.json(
        { error: "Invalid 'version' query parameter. Must be a number" },
        { status: 400 }
      );
    }

    // Parse request body
    const body = await request.json();
    const uploadSongs: UpdateSong[] = body.songs;

    if (!uploadSongs || !Array.isArray(uploadSongs)) {
      return NextResponse.json(
        { error: "Missing or invalid 'songs' array in request body" },
        { status: 400 }
      );
    }

    if (uploadSongs.length === 0) {
      return NextResponse.json(
        { error: "Empty 'songs' array in request body" },
        { status: 400 }
      );
    }

    // Create logger for this request
    const log = logger.child({
      route: "admin/upload",
      region,
      version
    });

    log.info({
      inputSongs: uploadSongs.length
    }, "Upload merge analysis starting");

    // Convert upload songs to PendingSong format with important fields
    const uploadPendingSongs: PendingSong[] = uploadSongs.map(convertUpdateSongToPendingSong);

    // Query database for existing songs
    log.info("Querying database for existing songs");
    const dbSongs = await db
      .select()
      .from(songs)
      .where(
        and(
          eq(songs.region, region),
          eq(songs.gameVersion, version)
        )
      );

    log.info({
      dbSongs: dbSongs.length
    }, "Found existing songs in database");

    // Convert DB songs to PendingSong format
    const dbPendingSongs: PendingSong[] = dbSongs.map(convertDbSongToPendingSong);

    // Use mergeSongs function to merge the datasets
    log.info("Merging songs");
    const take = taker(log);
    const merge = merger(log, take);

    // Collect merge events via sink
    const mergeEvents: MergeEvent[] = [];
    const addedSongs: PendingSong[] = [];
    const sink: MergeSink = {
      onMerge: (existing, incoming, result) => {
        mergeEvents.push({ existing, incoming, result });
      },
      onAdd: (song, isFirst) => {
        if (!isFirst) {
          addedSongs.push(song);
        }
      }
    };

    const mergedSongs = mergeSongs(
      dbPendingSongs,        // First: existing DB songs
      uploadPendingSongs,    // Second: uploaded songs (will update existing)
      "default",             // Mode: full bidirectional merge
      log,
      merge,
      take,
      sink
    );

    log.info({
      mergedSongs: mergedSongs.length
    }, "Merge completed");

    // Analyze changes using sink events
    const changes = analyzeChanges(dbPendingSongs, mergeEvents, addedSongs);

    // Fetch play record counts for deleted songs (if manageable number)
    if (changes.deleted.length > 0 && changes.deleted.length < 100) {
      const deletedDbIds = changes.deleted.map(d => BigInt(d.dbId));
      const scoreCounts = await db
        .select({ songId: userScores.songId, count: count() })
        .from(userScores)
        .where(inArray(userScores.songId, deletedDbIds))
        .groupBy(userScores.songId);

      const countMap = new Map(scoreCounts.map(r => [r.songId.toString(), r.count]));
      for (const deleted of changes.deleted) {
        deleted.playRecordCount = countMap.get(deleted.dbId) ?? 0;
      }
    }

    // Log summary statistics
    log.info({
      statistics: {
        inputSongs: uploadSongs.length,
        dbSongs: dbSongs.length,
        mergedSongs: mergedSongs.length,
        added: changes.added.length,
        modified: changes.modified.length,
        deleted: changes.deleted.length,
        unchanged: changes.unchanged.length
      }
    }, "Upload merge analysis complete");

    // Log each added song
    for (const change of changes.added) {
      log.trace({
        songKey: change.songKey,
        level: change.level,
        artist: change.artist
      }, `NEW: ${change.songKey}`);
    }

    // Log each modified song
    for (const change of changes.modified) {
      log.trace({
        songKey: change.songKey,
        changeCount: change.fieldChanges.length,
        changes: change.fieldChanges
      }, `MODIFIED: ${change.songKey}`);
    }

    // Log each deleted song
    for (const change of changes.deleted) {
      log.trace({
        songKey: change.songKey,
        dbId: change.dbId,
        level: change.level,
        artist: change.artist,
        playRecordCount: change.playRecordCount
      }, `DELETED: ${change.songKey}`);
    }

    // Apply DB changes if requested
    const applied = await applyChanges(changes, addedSongs, mergeEvents, region, version, updateMode);

    log.info({ updateMode, applied }, "DB update complete");

    // Send Discord webhook if changes were applied
    if (updateMode !== "noop") {
      sendDiscordWebhook(region, changes.added, changes.deleted.filter(d => (d.playRecordCount ?? 0) !== 0), changes.modified).catch(err => {
        log.error(err, "Failed to send Discord webhook");
      });
    }

    // Return response
    return NextResponse.json({
      success: true,
      updateMode,
      applied,
      statistics: {
        inputSongs: uploadSongs.length,
        dbSongs: dbSongs.length,
        mergedSongs: mergedSongs.length,
        added: changes.added.length,
        modified: changes.modified.length,
        deleted: changes.deleted.length,
        unchanged: changes.unchanged.length
      },
      changes: {
        added: changes.added,
        modified: changes.modified,
        deleted: changes.deleted,
        unchanged: changes.unchanged
      }
    });
  } catch (error) {
    console.error("Error in admin upload route:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

// Only allow POST requests
export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed" },
    { status: 405 }
  );
}
