import { and, eq, getTableColumns, sql } from "drizzle-orm";
import type { db } from "@/lib/db";
import { parentSong, scoreData, snapshotRankings, snapshotScores, songs } from "@/lib/db/schema-pg";
import { offersCapability } from "@/lib/games/capabilities";
import { RANKING_BUCKETS } from "@/lib/games/codes";
import { getGame } from "@/lib/games/registry";
import { rankScores, type StoredRankings } from "@/lib/games/ranking";
import type { CanonicalGameId } from "@/lib/games/types";
import { getLogger } from "@/lib/request-logger";
import type { ChartRef, ChartResolutionMap, NormalizedScore } from "./types";
import type { Region } from "@/lib/types";

type ScoreConnection = Pick<typeof db, "select" | "insert">;
export type DbSong = typeof songs.$inferSelect & Pick<typeof parentSong.$inferSelect, "songName" | "difficulty" | "type">;
export type ScoreDataValues = { songId: bigint } & Pick<NormalizedScore, "scoreValue" | "secondaryScore" | "comboStatus" | "syncStatus" | "clearStatus">;

export function chartKey(chart: Pick<ChartRef, "songName" | "difficulty" | "chartType">): string {
  return `${chart.songName}|${chart.difficulty}|${chart.chartType}`;
}

function scoreDataKey(score: ScoreDataValues): string {
  return `${score.songId}-${score.scoreValue}-${score.secondaryScore}-${score.comboStatus}-${score.syncStatus}-${score.clearStatus}`;
}

export function catalogCharts(connection: ScoreConnection, game: CanonicalGameId, region: Region, gameVersion: number): Promise<DbSong[]> {
  return connection.select({ ...getTableColumns(songs), songName: parentSong.songName, difficulty: parentSong.difficulty, type: parentSong.type })
    .from(songs).innerJoin(parentSong, eq(parentSong.id, songs.parentId))
    .where(and(eq(songs.game, game), eq(songs.region, region), eq(songs.gameVersion, gameVersion)));
}

/** Maps each chart key to its catalog chart, leaving out keys that more than one chart shares. */
export async function buildChartResolution(
  connection: ScoreConnection,
  game: CanonicalGameId,
  region: Region,
  gameVersion: number,
): Promise<{ chartResolution: ChartResolutionMap; songsById: Map<bigint, DbSong> }> {
  const chartResolution: ChartResolutionMap = new Map();
  const songsById = new Map<bigint, DbSong>();
  const ambiguous = new Set<string>();
  for (const song of await catalogCharts(connection, game, region, gameVersion)) {
    const key = chartKey({ songName: song.songName, difficulty: song.difficulty, chartType: song.type });
    if (chartResolution.has(key) || ambiguous.has(key)) {
      chartResolution.delete(key);
      ambiguous.add(key);
    } else {
      chartResolution.set(key, song.id);
    }
    songsById.set(song.id, song);
  }
  if (ambiguous.size > 0) {
    getLogger().warn({ songKeys: [...ambiguous], game, region, version: gameVersion }, "Ambiguous song names excluded from score lookup");
  }

  return { chartResolution, songsById };
}

async function upsertScoreData(
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

export type SnapshotScore = { values: ScoreDataValues; song: DbSong };

function buildRankingRows(
  game: CanonicalGameId,
  snapshotId: number,
  selection: StoredRankings<{ scoreId: number }>,
): (typeof snapshotRankings.$inferInsert)[] {
  return RANKING_BUCKETS.flatMap(bucket => ({ new: selection.newScores, old: selection.oldScores })[bucket.key]
    .map((score, rank) => ({ game, snapshotId, bucket: bucket.code, rank, scoreId: score.scoreId })));
}

/**
 * Stores a snapshot's scores and, for games with rankings, its rating selection.
 * Returns that selection, or null when nothing was ranked.
 */
export async function writeSnapshotScores(
  connection: ScoreConnection,
  input: { game: CanonicalGameId; snapshotId: number; gameVersion: number; scores: readonly SnapshotScore[] },
) {
  const scoreIds = await upsertScoreData(connection, input.game, input.scores.map(score => score.values));
  const stored = new Map<number, SnapshotScore>();
  for (const score of input.scores) {
    const scoreId = scoreIds.get(scoreDataKey(score.values));
    if (scoreId !== undefined && !stored.has(scoreId)) stored.set(scoreId, score);
  }

  const junctionRows = [...stored.keys()].map(scoreId => ({ game: input.game, snapshotId: input.snapshotId, scoreId }));
  for (let index = 0; index < junctionRows.length; index += 1000) {
    await connection.insert(snapshotScores).values(junctionRows.slice(index, index + 1000)).onConflictDoNothing();
  }

  if (!offersCapability(getGame(input.game), "rankings") || stored.size === 0) return null;
  const ranking = rankScores(input.game, [...stored].map(([scoreId, { values, song }]) => ({
    scoreId,
    scoreValue: values.scoreValue,
    comboStatus: values.comboStatus,
    levelPrecise: song.levelPrecise,
    difficultyCode: song.difficulty,
    addedVersion: song.addedVersion,
  })), input.gameVersion);
  const rankingRows = buildRankingRows(input.game, input.snapshotId, ranking);
  if (rankingRows.length > 0) await connection.insert(snapshotRankings).values(rankingRows).onConflictDoNothing();
  return ranking;
}
