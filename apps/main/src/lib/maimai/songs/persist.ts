import { and, eq, sql as sqlDrizzle } from "drizzle-orm";
import { db } from "../../db";
import { fetchSessions, parentSong, scoreData, snapshotB50, snapshotScores, songs } from "../../db/schema-pg";
import { logger } from "../../logger";
import { getCurrentVersion, VersionId } from "@tomomai/catalog/metadata";
import { splitSongs } from "../../rating-calculator";
import { Region, SongWithScore } from "../../types";
import type { ScoreData } from "../types";

/** Chart instance plus the chart-stable attributes that live on parent_song. */
export type FullSongData = typeof songs.$inferSelect &
  Pick<
    typeof parentSong.$inferSelect,
    "songName" | "artist" | "cover" | "difficulty" | "type" | "genre" | "bpm"
  >;

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
  fullSongMap: Map<bigint, FullSongData>;
}> {
  logger.info(`Batch querying songs for region ${region}, game version ${gameVersion}`);
  const allSongs = await db
    .select({ song: songs, parent: parentSong })
    .from(songs)
    .innerJoin(parentSong, eq(songs.parentId, parentSong.id))
    .where(and(
      eq(songs.region, region),
      eq(songs.gameVersion, gameVersion),
    ));
  logger.info(`Found ${allSongs.length} songs in database for this region/version`);

  const songLookup = new Map<string, bigint>();
  const fullSongMap = new Map<bigint, FullSongData>();

  for (const { song, parent } of allSongs) {
    const key = `${parent.songName}|${parent.difficulty}|${parent.type}`;
    songLookup.set(key, song.id);
    fullSongMap.set(song.id, {
      ...song,
      // Chart-stable attributes live on parent_song; merge them so
      // downstream consumers (ranking, B50) read the parent values.
      songName: parent.songName,
      artist: parent.artist,
      cover: parent.cover,
      difficulty: parent.difficulty,
      type: parent.type,
      genre: parent.genre,
      bpm: parent.bpm,
    });
  }
  logger.info(`Created song lookup maps with ${songLookup.size} entries`);

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
  fullSongMap: Map<bigint, FullSongData>,
): Promise<void> {
  const gameVersion = getCurrentVersion(region);

  logger.info(`Starting user scores insertion for snapshot ${snapshotId}`);

  const allScores: ScoreData[] = [];
  for (const difficulty of Object.keys(allScoreData)) {
    allScores.push(...allScoreData[parseInt(difficulty)]);
  }

  logger.info(`Total scores to insert: ${allScores.length}`);

  if (allScores.length === 0) {
    logger.warn("No scores to insert");
    return;
  }

  const resolvedScores: { songId: bigint; achievement: number; dxScore: number; fc: SongWithScore["fc"]; fs: SongWithScore["fs"] }[] = [];
  const notFoundScores: ScoreData[] = [];

  for (const score of allScores) {
    try {
      const lookupKey = `${score.songName}|${score.difficulty}|${score.musicType}`;
      const songId = songLookup.get(lookupKey);

      if (!songId) {
        logger.warn(`Could not find song in database: ${score.songName} (${score.difficulty}, ${score.musicType})`);
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
      logger.error(error, `Error processing score for ${score.songName}`);
    }
  }

  logger.info(`Prepared ${resolvedScores.length} scores, ${notFoundScores.length} songs not found in database`);

  if (resolvedScores.length > 0) {
    const scoreDataLookup = await upsertScoreData(resolvedScores);

    const junctionRows: { snapshotId: number; scoreId: number }[] = [];
    for (const score of resolvedScores) {
      const key = scoreDataKey(score.songId, score.achievement, score.dxScore, score.fc, score.fs);
      const scoreDataId = scoreDataLookup.get(key);
      if (!scoreDataId) {
        logger.warn(`scoreData ID not found for key ${key}`);
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

    logger.info(`B50 calculated. B15: ${newSongsB15.length}, B35: ${oldSongsB35.length}`);

    if (junctionRows.length > 0) {
      for (let i = 0; i < junctionRows.length; i += 1000) {
        await db.insert(snapshotScores).values(junctionRows.slice(i, i + 1000)).onConflictDoNothing();
      }
    }
    if (b50Rows.length > 0) {
      await db.insert(snapshotB50).values(b50Rows).onConflictDoNothing();
    }

    logger.info(`Inserted ${junctionRows.length} snapshotScores, ${b50Rows.length} snapshotB50 rows`);
  } else {
    logger.warn("No valid scores to insert");
  }

  if (notFoundScores.length > 0) {
    logger.warn(`Found ${notFoundScores.length} scores not found in database:`);
    for (const score of notFoundScores) {
      logger.warn(` - ${score.songName} (${score.difficulty}, ${score.musicType})`);
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
