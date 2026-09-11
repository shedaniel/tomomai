import { db } from "@/lib/db";
import { scoreData, songs, parentSong, userRecentSongs, userAlbums } from "@/lib/db/schema-pg";
import { flushLogger } from "@/lib/logger";
import { requestLogger } from "@/lib/request-logger";
import { getEnabledRegions, isRegionEnabled } from "@/lib/enabled-regions";
import { VersionId } from "@/lib/metadata";
import { Difficulty, Region, SongType } from "@/lib/types";
import { UpdateSong } from "@/lib/types/update";
import { taker, merger, key } from "@/server/services/admin/fetcher-utils";
import { important, PendingSong, value, Pending } from "@/server/utils/admin/type";
import { sendDiscordNotice, sendDiscordWebhook } from "@/server/services/admin/discord-webhooks";
import { publishSongCatalog } from "@/server/services/admin/song-catalog";
import { revalidatePath, revalidateTag } from "next/cache";
import { getSongSlugs } from "@/lib/song-slug";
import { locales } from "@tomomai/i18n/locale";
import { and, eq, inArray, count, sql, getTableColumns, notExists } from "drizzle-orm";
import { parseCatalogVersion } from "@/lib/catalog/parse-version";
import { findDuplicateUpload, matchUpload } from "@/lib/catalog/match-upload";
import { resolveParents, type ParentState, type SongToParent } from "@/lib/catalog/resolve-parent";
import { PARENT_PUBLIC_ID_LENGTH } from "@/lib/catalog/song-instance-id";
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
  playRecordCount?: number;
};

type ChangeAnalysis = {
  added: AddedChange[];
  modified: ModifiedChange[];
  deleted: DeletedChange[];
  unchanged: string[];
};

type DBSongType = typeof songs.$inferSelect & typeof parentSong.$inferSelect;
type CatalogTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

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
      parentId: dbSong.parentId.toString(),
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

/**
 * Push catalog edits to the ISR cache without waiting for the 14-day
 * revalidate window. Busts the shared songs data cache, then regenerates
 * each affected song-detail page (per locale) plus the list pages.
 */
async function revalidateSongsCache(
  affected: Array<{ songName: string; artist: string; type: SongType }>,
  log: (obj: unknown, msg?: string) => void,
  forceBulk = false,
) {
  revalidateTag("all-unique-songs", { expire: 3600 });
  revalidateTag("reserved-songs", { expire: 0 });
  revalidateTag("api-v1-songs", { expire: 0 });

  const seen = new Set<string>();
  const deduped = affected.filter((song) => {
    const key = `${song.songName}||${song.artist}||${song.type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const withSlugs = await getSongSlugs(deduped);
  const slugs = new Set(withSlugs.map((song) => song.slug));

  // Bulk uploads can touch hundreds of songs, so avoid thousands of calls.
  const bulk = forceBulk || slugs.size > 200;
  for (const locale of locales) {
    if (bulk) {
      revalidatePath(`/${locale}/db/songs/[slug]`, "page");
    } else {
      for (const slug of slugs) {
        revalidatePath(`/${locale}/db/songs/${slug}`, "page");
      }
    }
    revalidatePath(`/${locale}/db/songs`, "page");
  }
  revalidatePath("/sitemap.xml", "page");

  log({ count: slugs.size, scope: bulk ? "bulk" : "songs" }, "ISR cache revalidated");
}

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
async function resolveParentsForAddedRows(db: CatalogTransaction, addedRows: WriteRow[], region: Region, gameVersion: VersionId): Promise<number> {
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
        publicId: nanoid(PARENT_PUBLIC_ID_LENGTH),
        songName: p.songName,
        artist: p.artist,
        genre: p.genre,
        cover: p.cover,
        bpm: p.bpm,
        type: p.type,
        difficulty: p.difficulty,
        disambiguator: p.disambiguator,
      })))
      .returning({ id: parentSong.id, songName: parentSong.songName, type: parentSong.type, difficulty: parentSong.difficulty, disambiguator: parentSong.disambiguator });
    for (const parent of newParents) {
      const saved = inserted.find(row => row.songName === parent.songName && row.type === parent.type && row.difficulty === parent.difficulty && row.disambiguator === parent.disambiguator);
      if (!saved) throw new Error("Inserted parent missing from returned rows");
      parent.id = saved.id;
    }
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
async function updateParentAttributes(db: CatalogTransaction, allRows: WriteRow[], region: Region, gameVersion: VersionId): Promise<number> {
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
    maxScoreByParent.set(k, Math.max(maxScoreByParent.get(k) ?? -Infinity, score));
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
  db: CatalogTransaction,
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
    .filter(({ existing }) => changes.modified.some(change => change.dbId === String(existing.extras?.dbId)) && existing.extras?.parentId)
    .map(({ existing, result }) => ({
      song: result,
      parentId: BigInt(String(existing.extras!.parentId)),
    }));

  const addedRows: WriteRow[] = addedSongs.map(song => ({ song, parentId: null }));

  // 2. Resolve parents for the added rows (reuse existing charts or create new ones)
  const newParents = await resolveParentsForAddedRows(db, addedRows, region, version);

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

  const deletions = mode === "destructive" ? changes.deleted : changes.deleted.filter(change => change.playRecordCount === 0);
  for (let i = 0; i < deletions.length; i += 1000) {
    const ids = deletions.slice(i, i + 1000).map(change => BigInt(change.dbId));
    const deleted = await db.delete(songs).where(and(
      inArray(songs.id, ids),
      ...(mode === "destructive" ? [] : [
        notExists(db.select().from(scoreData).where(eq(scoreData.songId, songs.id))),
        notExists(db.select().from(userRecentSongs).where(eq(userRecentSongs.songId, songs.id))),
        notExists(db.select().from(userAlbums).where(eq(userAlbums.songId, songs.id))),
      ]),
    )).returning({ id: songs.id });
    appliedDeleted += deleted.length;
  }

  // 4. Update chart-stable parent attributes from this upload's merged values
  // when this (region, gameVersion) is the parent's preferred instance.
  const parentUpdates = await updateParentAttributes(db, [...modifiedRows, ...addedRows], region, version);

  return { added: appliedAdded, modified: appliedModified, deleted: appliedDeleted, newParents, parentUpdates };
}

export async function POST(request: NextRequest) {
  const { log: baseLog, requestId } = requestLogger(request, "admin/upload");
  let log = baseLog;
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

    let version: VersionId;
    try {
      version = parseCatalogVersion(region, versionParam);
    } catch {
      return NextResponse.json(
        { error: "Invalid 'version' query parameter. Must be a supported catalog version for the region" },
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

    const duplicateIndex = findDuplicateUpload(uploadSongs);
    if (duplicateIndex !== undefined) {
      return NextResponse.json(
        { error: `Duplicate chart identity at songs[${duplicateIndex}]`, requestId },
        { status: 400 }
      );
    }

    // Enrich the request logger now that region/version are known
    log = log.child({ region, version });

    log.info({
      songCount: uploadSongs.length
    }, "Upload merge analysis starting");

    // Convert upload songs to PendingSong format with important fields
    const uploadPendingSongs: PendingSong[] = uploadSongs.map(convertUpdateSongToPendingSong);

    const { dbSongs, mergedSongs, changes, applied, mergeEvents, addedSongs } = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(73641932)`);
      // Query database for existing songs
      log.info("Querying database for existing songs");
      const dbSongs = await tx
        .select({ ...getTableColumns(parentSong), ...getTableColumns(songs) })
        .from(songs)
        .innerJoin(parentSong, eq(songs.parentId, parentSong.id))
        .where(
          and(
            eq(songs.region, region),
            eq(songs.gameVersion, version)
          )
        );

      log.info({
        songCount: dbSongs.length
      }, "Found existing songs in database");

      // Convert DB songs to PendingSong format
      const dbPendingSongs: PendingSong[] = dbSongs.map(convertDbSongToPendingSong);

        log.info("Merging songs");
      const take = taker(log);
      const merge = merger(log, take);

      const mergeEvents: MergeEvent[] = [];
      const addedSongs: PendingSong[] = [];
      const matchInput = (song: PendingSong) => ({
        songName: song.songName, type: song.type, difficulty: song.difficulty,
        artist: value(song.artist) ?? "", addedVersion: value(song.addedVersion),
    });
    const assignments = matchUpload(dbPendingSongs.map(matchInput), uploadPendingSongs.map(matchInput));
    const mergedSongs = uploadPendingSongs.map((incoming, index) => {
      const existingIndex = assignments.get(index);
      if (existingIndex === undefined) {
        addedSongs.push(incoming);
        return incoming;
      }
      const existing = dbPendingSongs[existingIndex];
      const result = merge(existing, incoming);
      mergeEvents.push({ existing, incoming, result });
      return result;
    });

    log.info({
      songCount: mergedSongs.length
    }, "Merge completed");

    const changes = analyzeChanges(dbPendingSongs, mergeEvents, addedSongs);

    for (let i = 0; i < changes.deleted.length; i += 1000) {
      const batch = changes.deleted.slice(i, i + 1000);
      const ids = batch.map(change => BigInt(change.dbId));
      // Row locks prevent new foreign-key references racing the deletion guard.
      await tx.select({ id: songs.id }).from(songs).where(inArray(songs.id, ids)).for("update");
      const references = await Promise.all([
        tx.select({ songId: scoreData.songId, count: count() }).from(scoreData).where(inArray(scoreData.songId, ids)).groupBy(scoreData.songId),
        tx.select({ songId: userRecentSongs.songId, count: count() }).from(userRecentSongs).where(inArray(userRecentSongs.songId, ids)).groupBy(userRecentSongs.songId),
        tx.select({ songId: userAlbums.songId, count: count() }).from(userAlbums).where(inArray(userAlbums.songId, ids)).groupBy(userAlbums.songId),
      ]);
      const counts = new Map<string, number>();
      for (const row of references.flat()) counts.set(String(row.songId), (counts.get(String(row.songId)) ?? 0) + row.count);
      for (const change of batch) change.playRecordCount = counts.get(change.dbId) ?? 0;
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
        level: change.level
      }, `NEW: ${change.songKey}`);
    }

    // Log each modified song
    for (const change of changes.modified) {
      log.trace({
        songKey: change.songKey,
        count: change.fieldChanges.length
      }, `MODIFIED: ${change.songKey}`);
    }

    // Log each deleted song
    for (const change of changes.deleted) {
      log.trace({
        songKey: change.songKey,
        songId: change.dbId,
        level: change.level,
        count: change.playRecordCount
      }, `DELETED: ${change.songKey}`);
    }

    // Apply DB changes if requested
    const applied = await applyChanges(tx, changes, addedSongs, mergeEvents, region, version, updateMode);

    return { dbSongs, mergedSongs, changes, applied, mergeEvents, addedSongs };
    });

    const appliedCount = applied.added + applied.modified + applied.deleted;
    if (updateMode !== "noop") {
      // Publish first: ISR invalidation must never advertise catalog changes
      // while the stable API object still contains the previous DB state.
      const publication = await publishSongCatalog();
      log.info({ count: publication.songCount }, "Published public song catalog to R2");
    }

    log.info({ updateMode, applied: { added: applied.added, modified: applied.modified, deleted: applied.deleted } }, "DB update complete");

    // Push only committed edits to ISR; preserve both slug inputs for renames.
    if (updateMode !== "noop") {
      const modifiedDbIds = new Set(changes.modified.map(change => change.dbId));
      const modifiedSongs = mergeEvents
        .filter(({ existing }) => {
          const dbId = existing.extras?.dbId;
          return dbId && modifiedDbIds.has(String(dbId));
        })
        .flatMap(({ existing, result }) => [existing, result])
        .map(song => ({ songName: song.songName, artist: value(song.artist) ?? "", type: song.type }));
      const appliedDeletions = (updateMode === "destructive"
        ? changes.deleted
        : changes.deleted.filter(change => (change.playRecordCount ?? 0) === 0));
      const affectedSongs = [
        ...addedSongs.map(song => ({ songName: song.songName, artist: value(song.artist) ?? "", type: song.type })),
        ...modifiedSongs,
        ...appliedDeletions.map(change => ({ songName: change.songName, artist: change.artist, type: change.type })),
      ];
      try {
        await revalidateSongsCache(affectedSongs, (obj, msg) => log.info(obj, msg ?? ""), appliedCount === 0);
      } catch (err) {
        log.error({ err }, "Failed to revalidate songs ISR cache");
      }
    }

    // Send Discord webhook if changes were applied
    if (updateMode !== "noop") {
      const actuallyDeleted = updateMode === "destructive" ? changes.deleted : changes.deleted.filter(d => d.playRecordCount === 0);
      sendDiscordWebhook(region, changes.added, actuallyDeleted, changes.modified).catch(err => {
        log.error({ err }, "Failed to send Discord webhook");
      });
    }

    // Send notice webhook with upload summary
    {
      const skippedDeletions = updateMode !== "destructive"
        ? changes.deleted.filter(d => (d.playRecordCount ?? 0) > 0)
        : [];
      let desc = `**Mode:** ${updateMode}\n**Input:** ${uploadSongs.length} | **DB:** ${dbSongs.length} | **Merged:** ${mergedSongs.length}\n**Applied:** +${applied.added} ~${applied.modified} -${applied.deleted}`;
      if (skippedDeletions.length > 0) {
        desc += `\n\n**${skippedDeletions.length} deletion(s) skipped** (have saved user references):\n`;
        desc += skippedDeletions.slice(0, 15).map(d => `- ${d.songKey} (${d.playRecordCount} references)`).join("\n");
        if (skippedDeletions.length > 15) desc += `\n... and ${skippedDeletions.length - 15} more`;
      }
      sendDiscordNotice(
        region,
        "Upload complete",
        desc,
        skippedDeletions.length > 0 ? 0xFFA500 : 0x00FF00,
      ).catch(() => { });
    }

    // Return response
    return NextResponse.json({
      success: true,
      requestId,
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
    log.error({ err: error }, "Error in admin upload route");
    sendDiscordNotice(
      "intl",
      "Upload error",
      `**Error:** ${error instanceof Error ? error.message : String(error)}`,
      0xFF0000,
    ).catch(() => { });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error", requestId },
      { status: 500 }
    );
  } finally {
    // Serverless: ship buffered logs before the function is frozen/terminated.
    await flushLogger();
  }
}

// Only allow POST requests
export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed" },
    { status: 405 }
  );
}
