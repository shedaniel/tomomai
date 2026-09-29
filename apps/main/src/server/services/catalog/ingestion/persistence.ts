import { db } from "@/lib/db";
import { scoreData, songs, parentSong, userRecentSongs, userAlbums } from "@/lib/db/schema-pg";
import type { Region } from "@/lib/types";
import { mergeCatalogChart, catalogChartKey as key, type CatalogChart } from "@/server/services/catalog/ingestion/normalize-charts";
import { and, eq, inArray, count, sql, getTableColumns, notExists } from "drizzle-orm";
import { matchUpload } from "@/server/services/catalog/ingestion/match-upload";
import { resolveParents, type ParentState, type SongToParent } from "@/server/services/catalog/ingestion/resolve-parent";
import { PARENT_PUBLIC_ID_LENGTH } from "@/lib/catalog/song-instance-id";
import { instancePreference } from "@/lib/games/regions";
import { lockCatalogWrites, type CatalogTransaction } from "./lock";
import { nanoid } from "nanoid";
import { isDeepStrictEqual } from "node:util";

import type { Logger } from "pino";
import type { CanonicalGameId } from "@/lib/games/types";
export type FieldChange = {
  field: string;
  oldValue: unknown;
  newValue: unknown;
};

export type AddedChange = {
  songKey: string;
  songName: string;
  difficulty: number;
  chartType: number;
  level: string;
  levelPrecise: number;
  artist: string;
};

export type ModifiedChange = {
  songKey: string;
  songName: string;
  difficulty: number;
  chartType: number;
  fieldChanges: FieldChange[];
  dbId: string;
};

export type DeletedChange = {
  songKey: string;
  songName: string;
  difficulty: number;
  chartType: number;
  level: string;
  levelPrecise: number;
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

type MergeEvent = {
  existing: CatalogChart;
  incoming: CatalogChart;
  result: CatalogChart;
};

/**
 * Restore catalog values while retaining database identities
 */
function convertDbSongToCatalogChart(dbSong: DBSongType): CatalogChart {
  return {
    game: dbSong.game,
    songName: dbSong.songName,
    chartType: dbSong.type,
    difficulty: dbSong.difficulty,
    artist: dbSong.artist,
    cover: dbSong.cover,
    level: dbSong.level,
    levelPrecise: dbSong.levelPrecise,
    genre: dbSong.genre,
    addedVersion: dbSong.addedVersion,
    bpm: dbSong.bpm ?? undefined,
    noteDesigner: dbSong.noteDesigner ?? undefined,
    noteCounts: dbSong.tapCount !== null ? {
      tap: dbSong.tapCount!,
      hold: dbSong.holdCount!,
      slide: dbSong.slideCount!,
      touch: dbSong.touchCount!,
      break: dbSong.breakCount!
    } : undefined,
    metadata: dbSong.metadata ?? undefined,
    extras: {
      dbId: dbSong.id.toString(),
      parentId: dbSong.parentId.toString(),
      source: "database"
    }
  };
}

function jsonValue(value: unknown): unknown {
  // Match jsonb's omission of undefined fields before comparing object values.
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function compareFields(dbSong: CatalogChart, mergedSong: CatalogChart): FieldChange[] {
  const changes: FieldChange[] = [];

  const fields: Array<keyof CatalogChart> = [
    "artist", "cover", "level", "levelPrecise", "genre",
    "addedVersion", "bpm", "noteDesigner", "noteCounts", "metadata"
  ];

  for (const field of fields) {
    const dbValue = dbSong[field];
    const mergedValue = mergedSong[field];

    if (field === "noteCounts" || field === "metadata") {
      if (!isDeepStrictEqual(jsonValue(dbValue), jsonValue(mergedValue))) {
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
  dbCatalogCharts: CatalogChart[],
  mergeEvents: MergeEvent[],
  addedSongs: CatalogChart[]
): ChangeAnalysis {
  const added: AddedChange[] = addedSongs.map(song => ({
    songKey: key(song),
    songName: song.songName,
    difficulty: song.difficulty,
    chartType: song.chartType,
    level: song.level,
    levelPrecise: song.levelPrecise,
    artist: song.artist || ""
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
        chartType: result.chartType,
        fieldChanges,
        dbId: String(existing.extras?.dbId ?? "")
      });
    } else {
      unchanged.push(key(result));
    }
  }

  const deleted: DeletedChange[] = [];
  for (const dbSong of dbCatalogCharts) {
    const dbId = dbSong.extras?.dbId;
    const dbIdStr = dbId ? String(dbId) : undefined;
    if (dbIdStr && !mergedDbIds.has(dbIdStr)) {
      deleted.push({
        songKey: key(dbSong),
        songName: dbSong.songName,
        difficulty: dbSong.difficulty,
        chartType: dbSong.chartType,
        level: dbSong.level,
        levelPrecise: dbSong.levelPrecise,
        artist: dbSong.artist || "",
        dbId: dbIdStr
      });
    }
  }

  return { added, modified, deleted, unchanged };
}

type UpdateMode = "noop" | "alter" | "destructive";

/** A merged song that needs to be written, with its (eventually) resolved parent. */
type WriteRow = {
  song: CatalogChart;
  parentId: bigint | null;
};

function pendingSongToChildValues(game: CanonicalGameId, row: WriteRow, region: Region, gameVersion: number) {
  const noteCounts = row.song.noteCounts;
  return {
    game,
    parentId: row.parentId!,
    level: row.song.level,
    levelPrecise: row.song.levelPrecise,
    region,
    gameVersion,
    addedVersion: row.song.addedVersion,
    noteDesigner: row.song.noteDesigner ?? null,
    metadata: row.song.metadata ?? null,
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
async function resolveParentsForAddedRows(db: CatalogTransaction, game: CanonicalGameId, addedRows: WriteRow[], region: Region, gameVersion: number): Promise<number> {
  if (addedRows.length === 0) return 0;

  const names = [...new Set(addedRows.map(r => r.song.songName))];
  const candidateParents = await db
    .select()
    .from(parentSong)
    .where(and(eq(parentSong.game, game), inArray(parentSong.songName, names)));

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
      game,
      songName: p.songName,
      chartType: p.type,
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
    game,
    songName: row.song.songName,
    chartType: row.song.chartType,
    difficulty: row.song.difficulty,
    artist: row.song.artist ?? "",
    genre: row.song.genre ?? "",
    cover: row.song.cover ?? "",
    bpm: row.song.bpm ?? null,
    addedVersion: row.song.addedVersion,
    region,
    gameVersion,
  }));

  const { assignments, newParents } = resolveParents(songsToParent, existingStates);

  const batchSize = 1000;
  for (let i = 0; i < newParents.length; i += batchSize) {
    const batch = newParents.slice(i, i + batchSize);
    const inserted = await db
      .insert(parentSong)
      .values(batch.map(p => ({
        game,
        publicId: nanoid(PARENT_PUBLIC_ID_LENGTH),
        songName: p.songName,
        artist: p.artist,
        genre: p.genre,
        cover: p.cover,
        bpm: p.bpm,
        type: p.chartType,
        difficulty: p.difficulty,
        disambiguator: p.disambiguator,
      })))
      .returning({ id: parentSong.id, songName: parentSong.songName, type: parentSong.type, difficulty: parentSong.difficulty, disambiguator: parentSong.disambiguator });
    for (const parent of batch) {
      const saved = inserted.find(row => row.songName === parent.songName && row.type === parent.chartType && row.difficulty === parent.difficulty && row.disambiguator === parent.disambiguator);
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

/** Only a parent's preferred instance (see instancePreference) may overwrite its chart-stable attributes. */
async function updateParentAttributes(db: CatalogTransaction, allRows: WriteRow[], region: Region, gameVersion: number): Promise<number> {
  const mergedByParent = new Map<string, CatalogChart>();
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

  const uploadScore = instancePreference({ region, gameVersion });

  const maxScoreByParent = new Map<string, number>();
  for (const child of children) {
    const k = child.parentId.toString();
    const score = instancePreference(child);
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

    const artist = merged.artist ?? parent.artist;
    const cover = merged.cover ?? parent.cover;
    const genre = merged.genre ?? parent.genre;
    const bpm = merged.bpm ?? parent.bpm;

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
  game: CanonicalGameId,
  changes: ChangeAnalysis,
  addedSongs: CatalogChart[],
  mergeEvents: MergeEvent[],
  region: Region,
  version: number,
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
  const newParents = await resolveParentsForAddedRows(db, game, addedRows, region, version);

  // 3. Upsert child rows on (parentId, region, gameVersion)
  let appliedAdded = 0;
  let appliedModified = 0;
  let appliedDeleted = 0;

  const upsertBatch = async (rows: WriteRow[]) => {
    const batchSize = 1000;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize).map(row => pendingSongToChildValues(game, row, region, version));
      await db.insert(songs).values(batch).onConflictDoUpdate({
        target: [songs.parentId, songs.region, songs.gameVersion],
        set: {
          level: sql`excluded.level`,
          levelPrecise: sql`excluded."levelPrecise"`,
          addedVersion: sql`excluded."addedVersion"`,
          noteDesigner: sql`excluded."noteDesigner"`,
          metadata: sql`excluded.metadata`,
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
      eq(songs.game, game),
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


export async function persistCatalog(game: CanonicalGameId, region: Region, version: number, uploadSongs: CatalogChart[], updateMode: UpdateMode, log: Logger) {
    return db.transaction(async (tx) => {
      await lockCatalogWrites(tx);
      // Query database for existing songs
      log.info("Querying database for existing songs");
      const dbSongs = await tx
        .select({ ...getTableColumns(parentSong), ...getTableColumns(songs) })
        .from(songs)
        .innerJoin(parentSong, eq(songs.parentId, parentSong.id))
        .where(
          and(
            eq(songs.game, game),
            eq(songs.region, region),
            eq(songs.gameVersion, version)
          )
        );

      log.info({
        songCount: dbSongs.length
      }, "Found existing songs in database");

      const parentIds = [...new Set(dbSongs.map(song => song.parentId))];
      const siblings = parentIds.length === 0 ? [] : await tx
        .select({ parentId: songs.parentId, region: songs.region, gameVersion: songs.gameVersion })
        .from(songs)
        .where(inArray(songs.parentId, parentIds));
      const uploadScore = instancePreference({ region, gameVersion: version });
      const nonPreferredParents = new Set(siblings
        .filter(child => instancePreference(child) > uploadScore)
        .map(child => String(child.parentId)));

      // Convert DB songs to CatalogChart format
      const dbCatalogCharts: CatalogChart[] = dbSongs.map(convertDbSongToCatalogChart);

        log.info("Merging songs");
      const merge = mergeCatalogChart;

      const mergeEvents: MergeEvent[] = [];
      const addedSongs: CatalogChart[] = [];
    const assignments = matchUpload(dbCatalogCharts, uploadSongs);
    const matched = new Set(assignments.values());
    for (const [index, incoming] of uploadSongs.entries()) {
      if (!assignments.has(index) && dbCatalogCharts.some((existing, i) => !matched.has(i) && key(existing) === key(incoming))) {
        throw new Error(`Ambiguous catalog identity: ${key(incoming)}`);
      }
    }
    const mergedSongs = uploadSongs.map((incoming, index) => {
      const existingIndex = assignments.get(index);
      if (existingIndex === undefined) {
        addedSongs.push(incoming);
        return incoming;
      }
      const existing = dbCatalogCharts[existingIndex];
      const result = merge(existing, incoming);
      if (nonPreferredParents.has(String(existing.extras!.parentId))) {
        Object.assign(result, {
          artist: existing.artist, cover: existing.cover, genre: existing.genre, bpm: existing.bpm,
        });
      }
      mergeEvents.push({ existing, incoming, result });
      return result;
    });

    log.info({
      songCount: mergedSongs.length
    }, "Merge completed");

    const changes = analyzeChanges(dbCatalogCharts, mergeEvents, addedSongs);

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
    const applied = await applyChanges(tx, game, changes, addedSongs, mergeEvents, region, version, updateMode);

    return { dbSongs, mergedSongs, changes, applied, mergeEvents, addedSongs };
    });

}
