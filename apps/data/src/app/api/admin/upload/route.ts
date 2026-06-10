import { db } from "@/lib/db";
import { parentSong, songs } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { getEnabledRegions, isRegionEnabled } from "@tomomai/catalog/enabled-regions";
import { VersionId } from "@tomomai/catalog/metadata";
import { Difficulty, Region, SongType } from "@tomomai/catalog/types";
import { UpdateSong } from "@/lib/types/update";
import { mergeSongs, taker, merger, key, MergeSink } from "@/server/services/admin/fetcher-utils";
import { important, PendingSong, value, Pending } from "@/server/utils/admin/type";
import { sendDiscordNotice, sendDiscordWebhook } from "@/server/services/admin/discord-webhooks";
import { resolveParents, type ParentState, type SongToParent } from "@tomomai/catalog/resolve-parent";
import { and, eq, inArray, notExists, sql } from "drizzle-orm";
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
  levelPrecise: number | undefined;
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
  levelPrecise: number | undefined;
  artist: string;
  dbId: string;
};

type ChangeAnalysis = {
  added: AddedChange[];
  modified: ModifiedChange[];
  deleted: DeletedChange[];
  unchanged: string[];
};

type DBSongRow = {
  song: typeof songs.$inferSelect;
  parent: typeof parentSong.$inferSelect;
};

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
 * Convert a joined DB row (child song + parent chart) to PendingSong without
 * marking fields as important. Chart-stable attributes come from the parent,
 * per-instance data from the child.
 */
function convertDbRowToPendingSong({ song, parent }: DBSongRow): PendingSong {
  return {
    songName: parent.songName,
    type: parent.type,
    difficulty: parent.difficulty,
    artist: parent.artist,
    cover: parent.cover,
    level: song.level,
    levelPrecise: song.levelPrecise,
    genre: parent.genre,
    addedVersion: song.addedVersion as VersionId,
    bpm: parent.bpm ?? undefined,
    noteDesigner: song.noteDesigner ?? undefined,
    noteCounts: song.tapCount !== null ? {
      tap: song.tapCount!,
      hold: song.holdCount!,
      slide: song.slideCount!,
      touch: song.touchCount!,
      break: song.breakCount!
    } : undefined,
    extras: {
      dbId: song.id.toString(),
      parentId: parent.id.toString(),
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
    levelPrecise: value(song.levelPrecise),
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
        levelPrecise: value(dbSong.levelPrecise),
        artist: value(dbSong.artist) || "",
        dbId: dbIdStr
      });
    }
  }

  return { added, modified, deleted, unchanged };
}

type UpdateMode = "noop" | "alter" | "destructive";

/** A merged song that needs to be written, with its (eventually) resolved parent. */
type WriteRow = {
  song: PendingSong;
  parentId: bigint | null;
};

function pendingSongToChildValues(row: WriteRow, region: Region, gameVersion: VersionId) {
  const noteCounts = value(row.song.noteCounts as Pending<any>);
  return {
    parentId: row.parentId!,
    level: value(row.song.level as Pending<any>),
    levelPrecise: value(row.song.levelPrecise as Pending<any>),
    region,
    gameVersion,
    addedVersion: value(row.song.addedVersion as Pending<any>),
    noteDesigner: value(row.song.noteDesigner as Pending<any>) ?? null,
    tapCount: noteCounts?.tap ?? null,
    holdCount: noteCounts?.hold ?? null,
    slideCount: noteCounts?.slide ?? null,
    touchCount: noteCounts?.touch ?? null,
    breakCount: noteCounts?.break ?? null,
  };
}

/**
 * Resolve a parent for every row that doesn't have one yet (newly added
 * charts), creating new parent_song rows where necessary.
 */
async function resolveParentsForAddedRows(addedRows: WriteRow[], region: Region, gameVersion: VersionId): Promise<number> {
  if (addedRows.length === 0) return 0;

  const names = [...new Set(addedRows.map(r => r.song.songName))];
  const candidateParents = await db
    .select()
    .from(parentSong)
    .where(inArray(parentSong.songName, names));

  const candidateIds = candidateParents.map(p => p.id);
  const candidateChildren = candidateIds.length > 0
    ? await db
      .select({
        parentId: songs.parentId,
        addedVersion: songs.addedVersion,
        region: songs.region,
        gameVersion: songs.gameVersion,
      })
      .from(songs)
      .where(inArray(songs.parentId, candidateIds))
    : [];

  const childrenByParent = new Map<string, typeof candidateChildren>();
  for (const child of candidateChildren) {
    const list = childrenByParent.get(child.parentId.toString()) ?? [];
    list.push(child);
    childrenByParent.set(child.parentId.toString(), list);
  }

  const existingStates: ParentState[] = candidateParents.map(p => {
    const children = childrenByParent.get(p.id.toString()) ?? [];
    return {
      id: p.id,
      songName: p.songName,
      type: p.type,
      difficulty: p.difficulty,
      disambiguator: p.disambiguator,
      artist: p.artist,
      genre: p.genre,
      cover: p.cover,
      bpm: p.bpm,
      childAddedVersions: new Set(children.map(c => c.addedVersion)),
      childRegionVersions: new Set(children.map(c => `${c.region}:${c.gameVersion}`)),
    };
  });

  // Synthetic ids: index into addedRows
  const songsToParent: SongToParent[] = addedRows.map((row, index) => ({
    id: BigInt(index),
    songName: row.song.songName,
    type: row.song.type,
    difficulty: row.song.difficulty,
    artist: value(row.song.artist as Pending<any>) ?? "",
    genre: value(row.song.genre as Pending<any>) ?? "",
    cover: value(row.song.cover as Pending<any>) ?? "",
    bpm: value(row.song.bpm as Pending<any>) ?? null,
    addedVersion: value(row.song.addedVersion as Pending<any>) ?? 0,
    region,
    gameVersion,
  }));

  const { assignments, newParents } = resolveParents(songsToParent, existingStates);

  if (newParents.length > 0) {
    const inserted = await db
      .insert(parentSong)
      .values(newParents.map(p => ({
        publicId: nanoid(),
        songName: p.songName,
        artist: p.artist,
        genre: p.genre,
        cover: p.cover,
        bpm: p.bpm,
        type: p.type,
        difficulty: p.difficulty,
        disambiguator: p.disambiguator,
      })))
      .returning({ id: parentSong.id });
    newParents.forEach((p, i) => { p.id = inserted[i].id; });
  }

  addedRows.forEach((row, index) => {
    const state = assignments.get(BigInt(index));
    if (!state || state.id === null) {
      throw new Error(`Parent resolution failed for ${key(row.song)}`);
    }
    row.parentId = state.id;
  });

  return newParents.length;
}

/**
 * Update chart-stable parent attributes (artist, cover, genre, bpm) from the
 * merged values — but only when this upload's (region, gameVersion) is the
 * parent's preferred instance. Preferred = max over the parent's children of
 * gameVersion * 100 + (region === "jp" ? 1 : 0); this keeps parent attributes
 * tracking the latest-jp-preferred chart instance, matching how reads used to
 * pick attributes from the flat songs table.
 */
async function updateParentAttributes(allRows: WriteRow[], region: Region, gameVersion: VersionId): Promise<number> {
  const mergedByParent = new Map<string, PendingSong>();
  for (const row of allRows) {
    if (row.parentId === null) continue;
    mergedByParent.set(row.parentId.toString(), row.song);
  }
  if (mergedByParent.size === 0) return 0;

  const parentIds = [...mergedByParent.keys()].map(id => BigInt(id));
  const [parents, children] = await Promise.all([
    db.select().from(parentSong).where(inArray(parentSong.id, parentIds)),
    db.select({ parentId: songs.parentId, region: songs.region, gameVersion: songs.gameVersion })
      .from(songs)
      .where(inArray(songs.parentId, parentIds)),
  ]);

  const instanceScore = (r: string, v: number) => v * 100 + (r === "jp" ? 1 : 0);
  const uploadScore = instanceScore(region, gameVersion);

  const maxScoreByParent = new Map<string, number>();
  for (const child of children) {
    const k = child.parentId.toString();
    const score = instanceScore(child.region, child.gameVersion);
    maxScoreByParent.set(k, Math.max(maxScoreByParent.get(k) ?? -1, score));
  }

  let updated = 0;
  for (const parent of parents) {
    const k = parent.id.toString();
    const merged = mergedByParent.get(k);
    if (!merged) continue;

    // Only the preferred instance may overwrite chart-stable attributes
    const maxScore = maxScoreByParent.get(k) ?? uploadScore;
    if (uploadScore < maxScore) continue;

    const artist = value(merged.artist as Pending<any>) ?? parent.artist;
    const cover = value(merged.cover as Pending<any>) ?? parent.cover;
    const genre = value(merged.genre as Pending<any>) ?? parent.genre;
    const bpm = value(merged.bpm as Pending<any>) ?? null;

    if (artist !== parent.artist || cover !== parent.cover || genre !== parent.genre || bpm !== parent.bpm) {
      await db
        .update(parentSong)
        .set({ artist, cover, genre, bpm })
        .where(eq(parentSong.id, parent.id));
      updated++;
    }
  }

  return updated;
}

async function applyChanges(
  changes: ChangeAnalysis,
  addedSongs: PendingSong[],
  mergeEvents: MergeEvent[],
  region: Region,
  version: VersionId,
  mode: UpdateMode
): Promise<{ added: number; modified: number; deleted: number; newParents: number; parentUpdates: number }> {
  if (mode === "noop") return { added: 0, modified: 0, deleted: 0, newParents: 0, parentUpdates: 0 };

  // 1. Rows to write: modified (existing dbId → known parent) + added (need a parent)
  const modifiedRows: WriteRow[] = mergeEvents
    .filter(({ existing }) => existing.extras?.dbId && existing.extras?.parentId)
    .map(({ existing, result }) => ({
      song: result,
      parentId: BigInt(String(existing.extras!.parentId)),
    }));

  const addedRows: WriteRow[] = addedSongs.map(song => ({ song, parentId: null }));

  // 2. Resolve parents for the added rows (reuse existing charts or create new ones)
  const newParents = await resolveParentsForAddedRows(addedRows, region, version);

  // 3. Upsert child rows on (parentId, region, gameVersion)
  let appliedAdded = 0;
  let appliedModified = 0;
  let appliedDeleted = 0;

  const upsertBatch = async (rows: WriteRow[]) => {
    const batchSize = 1000;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize).map(row => pendingSongToChildValues(row, region, version));
      await db.insert(songs).values(batch).onConflictDoUpdate({
        target: [songs.parentId, songs.region, songs.gameVersion],
        set: {
          level: sql`excluded.level`,
          levelPrecise: sql`excluded."levelPrecise"`,
          addedVersion: sql`excluded."addedVersion"`,
          noteDesigner: sql`excluded."noteDesigner"`,
          tapCount: sql`excluded."tapCount"`,
          holdCount: sql`excluded."holdCount"`,
          slideCount: sql`excluded."slideCount"`,
          touchCount: sql`excluded."touchCount"`,
          breakCount: sql`excluded."breakCount"`,
        },
      });
    }
  };

  if (modifiedRows.length > 0) {
    await upsertBatch(modifiedRows);
    appliedModified = modifiedRows.length;
  }

  if (addedRows.length > 0) {
    await upsertBatch(addedRows);
    appliedAdded = addedRows.length;
  }

  // 5. Deletions: the data service has no user data, so there is no
  // play-record guard — delete the child rows directly in both alter and
  // destructive modes (the main app's catalog sync protects user-referenced
  // rows on its side).
  if (changes.deleted.length > 0) {
    const batchSize = 1000;
    for (let i = 0; i < changes.deleted.length; i += batchSize) {
      const batch = changes.deleted.slice(i, i + batchSize);
      const batchIds = batch.map(d => BigInt(d.dbId));
      await db.delete(songs).where(inArray(songs.id, batchIds));
      appliedDeleted += batch.length;
    }

    // Garbage-collect parents left with zero children
    await db
      .delete(parentSong)
      .where(notExists(db.select().from(songs).where(eq(songs.parentId, parentSong.id))));
  }

  // 4. Update chart-stable parent attributes from this upload's merged values
  // when this (region, gameVersion) is the parent's preferred instance.
  const parentUpdates = await updateParentAttributes([...modifiedRows, ...addedRows], region, version);

  return { added: appliedAdded, modified: appliedModified, deleted: appliedDeleted, newParents, parentUpdates };
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

    if (!region || !isRegionEnabled(region)) {
      return NextResponse.json(
        { error: `Missing or invalid 'region' query parameter. Must be one of: ${getEnabledRegions().join(", ")}` },
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
    const requestId = nanoid(10);
    const log = logger.child({
      route: "admin/upload",
      requestId,
      region,
      version
    });

    log.info({
      inputSongs: uploadSongs.length
    }, "Upload merge analysis starting");

    // Convert upload songs to PendingSong format with important fields
    const uploadPendingSongs: PendingSong[] = uploadSongs.map(convertUpdateSongToPendingSong);

    // Query database for existing songs (child rows joined with their parent chart)
    log.info("Querying database for existing songs");
    const dbRows: DBSongRow[] = await db
      .select({ song: songs, parent: parentSong })
      .from(songs)
      .innerJoin(parentSong, eq(songs.parentId, parentSong.id))
      .where(
        and(
          eq(songs.region, region),
          eq(songs.gameVersion, version)
        )
      );

    log.info({
      dbSongs: dbRows.length
    }, "Found existing songs in database");

    // Convert DB rows to PendingSong format
    const dbPendingSongs: PendingSong[] = dbRows.map(convertDbRowToPendingSong);

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

    // Log summary statistics
    log.info({
      statistics: {
        inputSongs: uploadSongs.length,
        dbSongs: dbRows.length,
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
        artist: change.artist
      }, `DELETED: ${change.songKey}`);
    }

    // Apply DB changes if requested
    const applied = await applyChanges(changes, addedSongs, mergeEvents, region, version, updateMode);

    log.info({ updateMode, applied }, "DB update complete");

    // Send Discord webhook if changes were applied
    if (updateMode !== "noop") {
      sendDiscordWebhook(region, changes.added, changes.deleted, changes.modified).catch(err => {
        log.error(err, "Failed to send Discord webhook");
      });
    }

    // Send notice webhook with upload summary
    {
      const desc = `**Mode:** ${updateMode}\n**Input:** ${uploadSongs.length} | **DB:** ${dbRows.length} | **Merged:** ${mergedSongs.length}\n**Applied:** +${applied.added} ~${applied.modified} -${applied.deleted} (parents: +${applied.newParents} ~${applied.parentUpdates})`;
      sendDiscordNotice(
        region,
        "Upload complete",
        desc,
        0x00FF00,
      ).catch(() => { });
    }

    // Return response
    return NextResponse.json({
      success: true,
      updateMode,
      applied,
      statistics: {
        inputSongs: uploadSongs.length,
        dbSongs: dbRows.length,
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
    sendDiscordNotice(
      "intl",
      "Upload error",
      `**Error:** ${error instanceof Error ? error.message : String(error)}`,
      0xFF0000,
    ).catch(() => { });
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
