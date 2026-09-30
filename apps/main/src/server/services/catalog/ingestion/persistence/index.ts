import { and, count, eq, getTableColumns, inArray, notExists } from "drizzle-orm";
import type { Logger } from "pino";
import { db } from "@/lib/db";
import { parentSong, scoreData, songs, userAlbums, userRecentSongs } from "@/lib/db/schema-pg";
import type { CanonicalGameId, Region } from "@/lib/games/ids";
import { excludedSet, INSTANCE_UPDATE_COLUMNS } from "../columns";
import { lockCatalogWrites, type CatalogTransaction } from "../lock";
import type { CatalogChart } from "../schema";
import {
  analyzeChanges,
  describeChanges,
  planDeletions,
  toInstanceValues,
  toStoredChart,
  type CatalogInstance,
  type CatalogUpdateMode,
  type ChangeAnalysis,
  type DeletedChange,
} from "./analyze";
import { findNonPreferredParents, resolveParentsForAddedCharts, updateParentAttributes, type WriteRow } from "./parents";

const BATCH_SIZE = 1000;

export type AppliedCounts = { added: number; modified: number; deleted: number; newParents: number; parentUpdates: number };

/** A chart whose public pages a write changed. A modified chart is listed before and after, so a changed artist refreshes both slugs. */
export type AffectedChart = Pick<CatalogChart, "songName" | "artist" | "chartType">;

export type CatalogPersistResult = {
  statistics: { inputSongs: number; dbSongs: number; mergedSongs: number; added: number; modified: number; deleted: number; unchanged: number };
  changes: ChangeAnalysis;
  applied: AppliedCounts;
  appliedDeletions: DeletedChange[];
  /** Removed charts left in place because user data references them. */
  skippedDeletions: DeletedChange[];
  affected: AffectedChart[];
};

async function countReferences(tx: CatalogTransaction, songIds: bigint[]): Promise<Map<bigint, number>> {
  const counts = new Map<bigint, number>();
  for (let start = 0; start < songIds.length; start += BATCH_SIZE) {
    const ids = songIds.slice(start, start + BATCH_SIZE);
    // Row locks keep new foreign-key references from racing the deletion guard.
    await tx.select({ id: songs.id }).from(songs).where(inArray(songs.id, ids)).for("update");
    const references = await Promise.all([
      tx.select({ songId: scoreData.songId, count: count() }).from(scoreData)
        .where(inArray(scoreData.songId, ids)).groupBy(scoreData.songId),
      tx.select({ songId: userRecentSongs.songId, count: count() }).from(userRecentSongs)
        .where(inArray(userRecentSongs.songId, ids)).groupBy(userRecentSongs.songId),
      tx.select({ songId: userAlbums.songId, count: count() }).from(userAlbums)
        .where(inArray(userAlbums.songId, ids)).groupBy(userAlbums.songId),
    ]);
    for (const row of references.flat()) counts.set(row.songId, (counts.get(row.songId) ?? 0) + row.count);
  }
  return counts;
}

async function upsertInstances(tx: CatalogTransaction, game: CanonicalGameId, rows: WriteRow[], instance: CatalogInstance) {
  for (let start = 0; start < rows.length; start += BATCH_SIZE) {
    await tx.insert(songs)
      .values(rows.slice(start, start + BATCH_SIZE).map(row => toInstanceValues(game, row.chart, row.parentId, instance)))
      .onConflictDoUpdate({ target: [songs.parentId, songs.region, songs.gameVersion], set: excludedSet(songs, INSTANCE_UPDATE_COLUMNS) });
  }
}

async function deleteInstances(tx: CatalogTransaction, game: CanonicalGameId, deletions: DeletedChange[], mode: CatalogUpdateMode): Promise<Set<string>> {
  const deleted = new Set<string>();
  for (let start = 0; start < deletions.length; start += BATCH_SIZE) {
    const ids = deletions.slice(start, start + BATCH_SIZE).map(change => BigInt(change.dbId));
    const rows = await tx.delete(songs).where(and(
      eq(songs.game, game),
      inArray(songs.id, ids),
      ...(mode === "destructive" ? [] : [
        notExists(tx.select().from(scoreData).where(eq(scoreData.songId, songs.id))),
        notExists(tx.select().from(userRecentSongs).where(eq(userRecentSongs.songId, songs.id))),
        notExists(tx.select().from(userAlbums).where(eq(userAlbums.songId, songs.id))),
      ]),
    )).returning({ id: songs.id });
    for (const row of rows) deleted.add(String(row.id));
  }
  return deleted;
}

export async function persistCatalog(
  game: CanonicalGameId,
  region: Region,
  version: number,
  charts: CatalogChart[],
  mode: CatalogUpdateMode,
  log: Logger,
): Promise<CatalogPersistResult> {
  const instance: CatalogInstance = { region, gameVersion: version };
  return db.transaction(async (tx) => {
    await lockCatalogWrites(tx);
    const rows = await tx
      .select({ ...getTableColumns(parentSong), ...getTableColumns(songs) })
      .from(songs)
      .innerJoin(parentSong, eq(songs.parentId, parentSong.id))
      .where(and(eq(songs.game, game), eq(songs.region, region), eq(songs.gameVersion, version)));
    const stored = rows.map(toStoredChart);
    log.info({ songCount: stored.length }, "Found existing songs in database");

    const nonPreferredParents = await findNonPreferredParents(tx, stored.map(entry => entry.parentId), instance);
    const analysis = analyzeChanges(stored, charts, nonPreferredParents);
    const changes = describeChanges(analysis, await countReferences(tx, analysis.removed.map(entry => entry.id)));
    const statistics = {
      inputSongs: charts.length,
      dbSongs: stored.length,
      mergedSongs: analysis.added.length + analysis.merged.length,
      added: changes.added.length,
      modified: changes.modified.length,
      deleted: changes.deleted.length,
      unchanged: changes.unchanged.length,
    };
    log.info({ statistics }, "Upload merge analysis complete");
    for (const change of changes.added) log.trace({ chartLabel: change.label }, "Catalog chart added");
    for (const change of changes.modified) log.trace({ chartLabel: change.label, count: change.fieldChanges.length }, "Catalog chart modified (count = changed fields)");
    for (const change of changes.deleted) log.trace({ chartLabel: change.label, songId: change.dbId, count: change.playRecordCount }, "Catalog chart removed (count = user references)");

    const deletions = planDeletions(changes.deleted, mode);
    if (mode === "noop") {
      return {
        statistics,
        changes,
        applied: { added: 0, modified: 0, deleted: 0, newParents: 0, parentUpdates: 0 },
        appliedDeletions: [],
        skippedDeletions: deletions.skip,
        affected: [],
      };
    }

    const modified = analysis.merged.filter(entry => entry.fieldChanges.length > 0);
    const modifiedRows: WriteRow[] = modified.map(({ stored, chart }) => ({ chart, parentId: stored.parentId }));
    const { parentIds, newParents } = await resolveParentsForAddedCharts(tx, game, analysis.added, instance);
    const addedRows: WriteRow[] = analysis.added.map((chart, index) => ({ chart, parentId: parentIds[index] }));
    await upsertInstances(tx, game, modifiedRows, instance);
    await upsertInstances(tx, game, addedRows, instance);
    const deletedIds = await deleteInstances(tx, game, deletions.apply, mode);
    const appliedDeletions = deletions.apply.filter(change => deletedIds.has(change.dbId));
    const parentUpdates = await updateParentAttributes(tx, [...modifiedRows, ...addedRows], instance);

    return {
      statistics,
      changes,
      applied: { added: addedRows.length, modified: modifiedRows.length, deleted: deletedIds.size, newParents, parentUpdates },
      appliedDeletions,
      skippedDeletions: deletions.skip,
      affected: [
        ...analysis.added,
        ...modified.flatMap(({ stored, chart }) => [stored.chart, chart]),
        ...appliedDeletions,
      ].map(({ songName, artist, chartType }) => ({ songName, artist, chartType })),
    };
  });
}
