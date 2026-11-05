import { SCORE_STATUS_KINDS, type ScoreStatusKind } from "@/lib/games/types";
import type { CanonicalGameId, Region } from "@/lib/games/ids";
import { GAME_CODES, keyOf } from "@/lib/games/codes";
import { getGrade } from "@/lib/games/presentation";
import { db } from "@/lib/db";
import { parentSong, scoreData, snapshotScores, songs, userSnapshots } from "@/lib/db/schema-pg";
import { and, eq, sql } from "drizzle-orm";
import { latestSnapshot } from "./latest-snapshot";

const NO_STATUS = "none";

export type StatsBucket = {
  grades: Record<string, number>;
  /** Scores per status code, for each status kind the game records. The no-status code is not counted. */
  statuses: Partial<Record<ScoreStatusKind, Record<string, number>>>;
  total: number;
};

export type LevelStatsBucket = StatsBucket & {
  /** Charts at this level in the game version, played or not. */
  charts: number;
};

/** Buckets are keyed by the charts' added version, then by difficulty code. */
export type StatsResult = {
  stats: Record<string, Record<string, StatsBucket>>;
  totalSongs: Record<string, Record<string, number>>;
  /** Added version, then difficulty code, then level, for breaking a filtered view down by level. */
  levels: Record<string, Record<string, Record<string, LevelStatsBucket>>>;
};

type StatsScore = { scoreValue: number } & Record<ScoreStatusKind, number>;

function recordedStatusKinds(game: CanonicalGameId): ScoreStatusKind[] {
  return SCORE_STATUS_KINDS.filter(kind => {
    const keys: readonly string[] = GAME_CODES[game][kind];
    return keys.some(key => key !== NO_STATUS);
  });
}

function emptyBucket(statusKinds: readonly ScoreStatusKind[]): StatsBucket {
  const statuses: StatsBucket["statuses"] = {};
  for (const kind of statusKinds) statuses[kind] = {};
  return { grades: {}, statuses, total: 0 };
}

function addScore(game: CanonicalGameId, statusKinds: readonly ScoreStatusKind[], bucket: StatsBucket, score: StatsScore) {
  const grade = getGrade(game, score.scoreValue);
  bucket.grades[grade] = (bucket.grades[grade] ?? 0) + 1;
  for (const kind of statusKinds) {
    const code = score[kind];
    if (keyOf(game, kind, code) === NO_STATUS) continue;
    const counts = bucket.statuses[kind] ??= {};
    counts[code] = (counts[code] ?? 0) + 1;
  }
  bucket.total++;
}

export async function computeStatsForSnapshot(
  game: CanonicalGameId,
  snapshotInternalId: number,
  gameVersion: number,
  region: Region
): Promise<StatsResult> {
  const scores = await db
    .select({
      scoreValue: scoreData.scoreValue,
      addedVersion: songs.addedVersion,
      difficulty: parentSong.difficulty,
      level: songs.level,
      comboStatus: scoreData.comboStatus,
      syncStatus: scoreData.syncStatus,
      clearStatus: scoreData.clearStatus,
    })
    .from(snapshotScores)
    .innerJoin(scoreData, eq(snapshotScores.scoreId, scoreData.id))
    .innerJoin(songs, eq(scoreData.songId, songs.id))
    .innerJoin(parentSong, eq(songs.parentId, parentSong.id))
    .where(eq(snapshotScores.snapshotId, snapshotInternalId));

  const catalogCharts = await db
    .select({
      addedVersion: songs.addedVersion,
      difficulty: parentSong.difficulty,
      level: songs.level,
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(songs)
    .innerJoin(parentSong, eq(songs.parentId, parentSong.id))
    .where(and(eq(songs.game, game), eq(songs.region, region), eq(songs.gameVersion, gameVersion)))
    .groupBy(songs.addedVersion, parentSong.difficulty, songs.level);

  const statusKinds = recordedStatusKinds(game);
  const totalSongs: StatsResult["totalSongs"] = {};
  const levels: StatsResult["levels"] = {};
  const levelBucket = (addedVersion: number, difficulty: number, level: string) =>
    ((levels[addedVersion] ??= {})[difficulty] ??= {})[level] ??= { ...emptyBucket(statusKinds), charts: 0 };

  for (const { addedVersion, difficulty, level, count } of catalogCharts) {
    const totals = totalSongs[addedVersion] ??= {};
    totals[difficulty] = (totals[difficulty] ?? 0) + count;
    levelBucket(addedVersion, difficulty, level).charts += count;
  }

  const stats: StatsResult["stats"] = {};
  for (const score of scores) {
    addScore(game, statusKinds, (stats[score.addedVersion] ??= {})[score.difficulty] ??= emptyBucket(statusKinds), score);
    addScore(game, statusKinds, levelBucket(score.addedVersion, score.difficulty, score.level), score);
  }

  return { stats, totalSongs, levels };
}

export async function fetchPlayerStats(game: CanonicalGameId, userId: string, region: Region): Promise<StatsResult> {
  const snapshot = await latestSnapshot(game, userId, region, { id: userSnapshots.id, gameVersion: userSnapshots.gameVersion });
  if (!snapshot) return { stats: {}, totalSongs: {}, levels: {} };
  return computeStatsForSnapshot(game, snapshot.id, snapshot.gameVersion, region);
}
