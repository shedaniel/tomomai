import { and, eq, getTableColumns, sql } from "drizzle-orm";
import type { db } from "@/lib/db";
import { parentSong, scoreData, songs } from "@/lib/db/schema-pg";
import type { CanonicalGameId } from "@/lib/games/types";
import type { ChartRef, ChartResolutionMap, NormalizedScore } from "./types";
import type { Region } from "@/lib/types";

type ScoreConnection = Pick<typeof db, "select" | "insert">;
export type DbSong = typeof songs.$inferSelect & Pick<typeof parentSong.$inferSelect, "songName" | "difficulty" | "type">;
export type ScoreDataValues = { songId: bigint } & Pick<NormalizedScore, "scoreValue" | "secondaryScore" | "comboStatus" | "syncStatus" | "clearStatus">;

export function chartKey(chart: Pick<ChartRef, "songName" | "difficulty" | "chartType">): string {
  return `${chart.songName}|${chart.difficulty}|${chart.chartType}`;
}

export function scoreDataKey(score: ScoreDataValues): string {
  return `${score.songId}-${score.scoreValue}-${score.secondaryScore}-${score.comboStatus}-${score.syncStatus}-${score.clearStatus}`;
}

export async function buildChartResolution(
  connection: ScoreConnection,
  game: CanonicalGameId,
  region: Region,
  gameVersion: number,
): Promise<{ chartResolution: ChartResolutionMap; songsById: Map<bigint, DbSong> }> {
  const allSongs = await connection.select({ ...getTableColumns(songs), songName: parentSong.songName, difficulty: parentSong.difficulty, type: parentSong.type })
    .from(songs).innerJoin(parentSong, and(eq(parentSong.id, songs.parentId), eq(parentSong.game, songs.game)))
    .where(and(eq(songs.game, game), eq(songs.region, region), eq(songs.gameVersion, gameVersion)));

  const chartResolution: ChartResolutionMap = new Map();
  const songsById = new Map<bigint, DbSong>();
  const ambiguous = new Set<string>();
  for (const song of allSongs) {
    const key = chartKey({ songName: song.songName, difficulty: song.difficulty, chartType: song.type });
    if (chartResolution.has(key) || ambiguous.has(key)) {
      chartResolution.delete(key);
      ambiguous.add(key);
    } else {
      chartResolution.set(key, song.id);
    }
    songsById.set(song.id, song);
  }

  return { chartResolution, songsById };
}

export async function upsertScoreData(
  connection: ScoreConnection,
  game: CanonicalGameId,
  scores: ScoreDataValues[],
): Promise<Map<string, number>> {
  const uniqueScores = new Map<string, ScoreDataValues>();
  for (const score of scores) {
    uniqueScores.set(scoreDataKey(score), score);
  }

  const insertValues = [...uniqueScores.values()]
    .map(score => ({ ...score, game }))
    .sort((a, b) =>
      (a.songId < b.songId ? -1 : a.songId > b.songId ? 1 : 0)
      || a.scoreValue - b.scoreValue
      || a.secondaryScore - b.secondaryScore
      || a.comboStatus - b.comboStatus
      || a.syncStatus - b.syncStatus
      || a.clearStatus - b.clearStatus,
    );

  const scoreDataLookup = new Map<string, number>();
  for (let index = 0; index < insertValues.length; index += 1000) {
    const rows = await connection.insert(scoreData)
      .values(insertValues.slice(index, index + 1000))
      .onConflictDoUpdate({
        target: [
          scoreData.songId,
          scoreData.scoreValue,
          scoreData.secondaryScore,
          scoreData.comboStatus,
          scoreData.syncStatus,
          scoreData.clearStatus,
        ],
        set: { songId: sql`excluded."songId"` },
      })
      .returning({
        id: scoreData.id,
        songId: scoreData.songId,
        scoreValue: scoreData.scoreValue,
        secondaryScore: scoreData.secondaryScore,
        comboStatus: scoreData.comboStatus,
        syncStatus: scoreData.syncStatus,
        clearStatus: scoreData.clearStatus,
      });

    for (const row of rows) {
      scoreDataLookup.set(
        scoreDataKey(row),
        row.id,
      );
    }
  }

  return scoreDataLookup;
}
