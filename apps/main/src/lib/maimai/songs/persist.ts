import { and, eq, getTableColumns, sql as sqlDrizzle } from "drizzle-orm";
import { db } from "../../db";
import { scoreData, songs, parentSong } from "../../db/schema-pg";
import { getLogger } from "../../request-logger";
import { codeToChartType, codeToComboStatus, codeToDifficulty, codeToSyncStatus, comboStatusToCode, syncStatusToCode } from "../codes";
import type { FullCombo, FullSync, Region } from "../../types";

type SongInstance = typeof songs.$inferSelect & typeof parentSong.$inferSelect;

/**
 * Builds song lookup maps for efficient song matching during insertion.
 * Queries all songs for the specified region and game version once.
 *
 * @returns Object containing:
 *   - songLookup: Map from "songName|difficulty|type" to songId
 *   - fullSongMap: Map from songId to full song data
 */
export async function buildSongLookupMaps(
  region: Region,
  gameVersion: number,
): Promise<{
  songLookup: Map<string, bigint>;
  fullSongMap: Map<bigint, SongInstance>;
}> {
  getLogger().info({ region, version: gameVersion }, "Batch querying songs");
  const allSongs = await db
    .select({ ...getTableColumns(parentSong), ...getTableColumns(songs) })
    .from(songs)
    .innerJoin(parentSong, eq(songs.parentId, parentSong.id))
    .where(and(eq(songs.region, region),
      eq(songs.game, "maimai"), eq(songs.gameVersion, gameVersion)));
  getLogger().info({ songCount: allSongs.length }, "Loaded songs for region/version");

  const songLookup = new Map<string, bigint>();
  const fullSongMap = new Map<bigint, SongInstance>();

  const ambiguousKeys = new Set<string>();
  for (const song of allSongs) {
    const key = `${song.songName}|${codeToDifficulty(song.difficulty)}|${codeToChartType(song.type)}`;
    if (songLookup.has(key) || ambiguousKeys.has(key)) {
      songLookup.delete(key);
      ambiguousKeys.add(key);
    } else {
      songLookup.set(key, song.id);
    }
    fullSongMap.set(song.id, song);
  }
  if (ambiguousKeys.size > 0) {
    getLogger().warn({ songKeys: [...ambiguousKeys], region, version: gameVersion }, "Ambiguous song names excluded from score lookup");
  }
  getLogger().info({ songCount: songLookup.size }, "Created song lookup maps");

  return { songLookup, fullSongMap };
}

export function scoreDataKey(songId: bigint, achievement: number, dxScore: number, fc: string, fs: string): string {
  return `${songId}-${achievement}-${dxScore}-${fc}-${fs}`;
}

export async function upsertScoreData(
  scores: { songId: bigint; achievement: number; dxScore: number; fc: FullCombo; fs: FullSync }[],
): Promise<Map<string, number>> {
  if (scores.length === 0) return new Map();

  const uniqueScores = new Map<string, typeof scores[number]>();
  for (const s of scores) {
    const key = scoreDataKey(s.songId, s.achievement, s.dxScore, s.fc, s.fs);
    uniqueScores.set(key, s);
  }

  // Sort by unique constraint columns for deterministic lock ordering (prevents deadlocks)
  const insertValues = [...uniqueScores.values()]
    .map(s => ({
      game: "maimai" as const,
      songId: s.songId,
      scoreValue: s.achievement,
      secondaryScore: s.dxScore,
      comboStatus: comboStatusToCode(s.fc),
      syncStatus: syncStatusToCode(s.fs),
      clearStatus: 0,
    }))
    .sort((a, b) =>
      Number(a.songId - b.songId)
      || a.scoreValue - b.scoreValue
      || a.secondaryScore - b.secondaryScore
      || a.comboStatus - b.comboStatus
      || a.syncStatus - b.syncStatus,
    );

  // Upsert in chunks sequentially (parallel chunks on the same table can deadlock)
  const CHUNK_SIZE = 1000;
  const result = new Map<string, number>();

  for (let i = 0; i < insertValues.length; i += CHUNK_SIZE) {
    const rows = await db.insert(scoreData)
      .values(insertValues.slice(i, i + CHUNK_SIZE))
      .onConflictDoUpdate({
        target: [scoreData.songId, scoreData.scoreValue, scoreData.secondaryScore, scoreData.comboStatus, scoreData.syncStatus, scoreData.clearStatus],
        set: { songId: sqlDrizzle`excluded."songId"` },
      })
      .returning({
        id: scoreData.id,
        songId: scoreData.songId,
        achievement: scoreData.scoreValue,
        dxScore: scoreData.secondaryScore,
        comboStatus: scoreData.comboStatus,
        syncStatus: scoreData.syncStatus,
      });

    for (const row of rows) {
      const key = scoreDataKey(
        row.songId,
        row.achievement,
        row.dxScore,
        codeToComboStatus(row.comboStatus),
        codeToSyncStatus(row.syncStatus),
      );
      result.set(key, row.id);
    }
  }

  return result;
}
