import { and, eq, getTableColumns, sql as sqlDrizzle } from "drizzle-orm";
import { db } from "../../db";
import { fetchSessions, scoreData, snapshotB50, snapshotScores, songs, parentSong } from "../../db/schema-pg";
import { getLogger } from "../../request-logger";
import { getCurrentVersion, VersionId } from "../../metadata";
import { splitSongs } from "../../rating-calculator";
import { Region, SongWithScore } from "../../types";
import type { ScoreData } from "../types";

type SongInstance = typeof songs.$inferSelect & Omit<typeof parentSong.$inferSelect, "id">;

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
    .where(and(eq(songs.region, region), eq(songs.gameVersion, gameVersion)));
  getLogger().info({ songCount: allSongs.length }, "Loaded songs for region/version");

  const songLookup = new Map<string, bigint>();
  const fullSongMap = new Map<bigint, SongInstance>();

  const ambiguousKeys = new Set<string>();
  for (const song of allSongs) {
    const key = `${song.songName}|${song.difficulty}|${song.type}`;
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
  scores: { songId: bigint; achievement: number; dxScore: number; fc: string; fs: string }[],
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
      songId: s.songId,
      achievement: s.achievement,
      dxScore: s.dxScore,
      fc: s.fc as typeof scoreData.$inferInsert['fc'],
      fs: s.fs as typeof scoreData.$inferInsert['fs'],
    }))
    .sort((a, b) =>
      Number(a.songId - b.songId)
      || a.achievement - b.achievement
      || a.dxScore - b.dxScore
      || a.fc.localeCompare(b.fc)
      || a.fs.localeCompare(b.fs),
    );

  // Upsert in chunks sequentially (parallel chunks on the same table can deadlock)
  const CHUNK_SIZE = 1000;
  const result = new Map<string, number>();

  for (let i = 0; i < insertValues.length; i += CHUNK_SIZE) {
    const rows = await db.insert(scoreData)
      .values(insertValues.slice(i, i + CHUNK_SIZE))
      .onConflictDoUpdate({
        target: [scoreData.songId, scoreData.achievement, scoreData.dxScore, scoreData.fc, scoreData.fs],
        set: { songId: sqlDrizzle`excluded."songId"` },
      })
      .returning({
        id: scoreData.id,
        songId: scoreData.songId,
        achievement: scoreData.achievement,
        dxScore: scoreData.dxScore,
        fc: scoreData.fc,
        fs: scoreData.fs,
      });

    for (const row of rows) {
      const key = scoreDataKey(row.songId, row.achievement, row.dxScore, row.fc, row.fs);
      result.set(key, row.id);
    }
  }

  return result;
}

export async function insertUserScores(
  snapshotId: number,
  region: Region,
  sessionId: bigint,
  allScoreData: { [difficulty: number]: ScoreData[] },
  songLookup: Map<string, bigint>,
  fullSongMap: Map<bigint, SongInstance>,
): Promise<void> {
  const gameVersion = getCurrentVersion(region);

  getLogger().info({ snapshotId, sessionId: String(sessionId) }, "Starting user scores insertion");

  const allScores: ScoreData[] = [];
  for (const difficulty of Object.keys(allScoreData)) {
    allScores.push(...allScoreData[parseInt(difficulty)]);
  }

  getLogger().info({ recordCount: allScores.length }, "Preparing scores for insertion");

  if (allScores.length === 0) {
    getLogger().warn("No scores to insert");
    return;
  }

  const resolvedScores: { songId: bigint; achievement: number; dxScore: number; fc: SongWithScore["fc"]; fs: SongWithScore["fs"] }[] = [];
  const notFoundScores: ScoreData[] = [];

  for (const score of allScores) {
    try {
      const lookupKey = `${score.songName}|${score.difficulty}|${score.musicType}`;
      const songId = songLookup.get(lookupKey);

      if (!songId) {
        getLogger().warn({ songKey: lookupKey }, "Could not resolve song in database");
        notFoundScores.push(score);
        continue;
      }

      resolvedScores.push({
        songId,
        achievement: score.achievement,
        dxScore: score.dxScore,
        fc: score.fc,
        fs: score.fs,
      });
    } catch (error) {
      getLogger().error({ err: error, songKey: `${score.songName}|${score.difficulty}|${score.musicType}` }, "Error processing score");
    }
  }

  getLogger().info({ recordCount: resolvedScores.length, skipped: notFoundScores.length }, "Prepared score rows");

  if (resolvedScores.length > 0) {
    const scoreDataLookup = await upsertScoreData(resolvedScores);

    const junctionRows: { snapshotId: number; scoreId: number }[] = [];
    for (const score of resolvedScores) {
      const key = scoreDataKey(score.songId, score.achievement, score.dxScore, score.fc, score.fs);
      const scoreDataId = scoreDataLookup.get(key);
      if (!scoreDataId) {
        getLogger().warn({ songId: String(score.songId) }, "Score data row not found after upsert");
        continue;
      }
      junctionRows.push({ snapshotId, scoreId: scoreDataId });
    }

    const songsForRanking: (Omit<SongWithScore, 'songId'> & { songId: bigint })[] = [];
    for (const score of resolvedScores) {
      const fullSong = fullSongMap.get(score.songId);
      if (!fullSong) continue;
      songsForRanking.push({
        songId: fullSong.id,
        songName: fullSong.songName,
        artist: fullSong.artist,
        cover: fullSong.cover,
        difficulty: fullSong.difficulty,
        level: fullSong.level,
        levelPrecise: fullSong.levelPrecise,
        type: fullSong.type,
        genre: fullSong.genre,
        addedVersion: fullSong.addedVersion as VersionId,
        achievement: score.achievement,
        dxScore: score.dxScore,
        fc: score.fc,
        fs: score.fs,
      });
    }

    const { newSongsB15, oldSongsB35 } = splitSongs(songsForRanking, gameVersion);

    const b50Rows: { snapshotId: number; rank: number; scoreId: number }[] = [];
    for (let i = 0; i < newSongsB15.length; i++) {
      const song = newSongsB15[i];
      const key = scoreDataKey(song.songId, song.achievement, song.dxScore, song.fc, song.fs);
      const scoreDataId = scoreDataLookup.get(key);
      if (scoreDataId) {
        b50Rows.push({ snapshotId, rank: i, scoreId: scoreDataId });
      }
    }
    for (let i = 0; i < oldSongsB35.length; i++) {
      const song = oldSongsB35[i];
      const key = scoreDataKey(song.songId, song.achievement, song.dxScore, song.fc, song.fs);
      const scoreDataId = scoreDataLookup.get(key);
      if (scoreDataId) {
        b50Rows.push({ snapshotId, rank: 15 + i, scoreId: scoreDataId });
      }
    }

    getLogger().info({ recordCount: b50Rows.length }, "Calculated B50");

    if (junctionRows.length > 0) {
      for (let i = 0; i < junctionRows.length; i += 1000) {
        await db.insert(snapshotScores).values(junctionRows.slice(i, i + 1000)).onConflictDoNothing();
      }
    }
    if (b50Rows.length > 0) {
      await db.insert(snapshotB50).values(b50Rows).onConflictDoNothing();
    }

    getLogger().info({ recordCount: junctionRows.length }, "Inserted snapshot scores and B50 rows");
  } else {
    getLogger().warn("No valid scores to insert");
  }

  if (notFoundScores.length > 0) {
    getLogger().warn({ skipped: notFoundScores.length }, "Some scores have no unambiguous catalog match");
    for (const score of notFoundScores) {
      getLogger().warn({ songKey: `${score.songName}|${score.difficulty}|${score.musicType}` }, "Unmatched score");
    }
    await db
      .update(fetchSessions)
      .set({
        extraData: JSON.stringify({
          notFoundScores: notFoundScores.map(score => ({
            songName: score.songName,
            difficulty: score.difficulty,
            musicType: score.musicType,
          })),
        }),
      })
      .where(eq(fetchSessions.id, sessionId));
  }
}
