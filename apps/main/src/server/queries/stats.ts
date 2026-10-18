import { db } from "@/lib/db";
import { parentSong, scoreData, snapshotScores, songs, userSnapshots } from "@/lib/db/schema-pg";
import { and, desc, eq, sql } from "drizzle-orm";
import { getAchievementRate } from "@/lib/difficulty";
import type { Region } from "@/lib/types";

type StatsBucket = {
  grades: Record<string, number>;
  fc: Record<string, number>;
  fs: Record<string, number>;
  total: number;
};

export type LevelStatsBucket = StatsBucket & {
  /** Charts at this level in the game version, played or not. */
  charts: number;
};

export type StatsResult = {
  stats: Record<string, Record<string, StatsBucket>>;
  totalSongs: Record<string, Record<string, number>>;
  /** addedVersion → difficulty → level, for breaking a filtered view down by level. */
  levels: Record<string, Record<string, Record<string, LevelStatsBucket>>>;
};

function emptyBucket(): StatsBucket {
  return { grades: {}, fc: {}, fs: {}, total: 0 };
}

function addScore(bucket: StatsBucket, score: { achievement: number; fc: string; fs: string }) {
  const grade = getAchievementRate(score.achievement);
  bucket.grades[grade] = (bucket.grades[grade] ?? 0) + 1;
  if (score.fc !== "none") bucket.fc[score.fc] = (bucket.fc[score.fc] ?? 0) + 1;
  if (score.fs !== "none") bucket.fs[score.fs] = (bucket.fs[score.fs] ?? 0) + 1;
  bucket.total++;
}

export async function computeStatsForSnapshot(
  snapshotInternalId: number,
  gameVersion: number,
  region: Region
): Promise<StatsResult> {
  const scores = await db
    .select({
      achievement: scoreData.achievement,
      addedVersion: songs.addedVersion,
      difficulty: parentSong.difficulty,
      level: songs.level,
      fc: scoreData.fc,
      fs: scoreData.fs,
    })
    .from(snapshotScores)
    .innerJoin(scoreData, eq(snapshotScores.scoreId, scoreData.id))
    .innerJoin(songs, eq(scoreData.songId, songs.id))
    .innerJoin(parentSong, eq(songs.parentId, parentSong.id))
    .where(eq(snapshotScores.snapshotId, snapshotInternalId));

  const allSongs = await db
    .select({
      addedVersion: songs.addedVersion,
      difficulty: parentSong.difficulty,
      level: songs.level,
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(songs)
    .innerJoin(parentSong, eq(songs.parentId, parentSong.id))
    .where(
      and(
        eq(songs.region, region),
        eq(songs.gameVersion, gameVersion)
      )
    )
    .groupBy(songs.addedVersion, parentSong.difficulty, songs.level);

  const totalSongs: StatsResult["totalSongs"] = {};
  const levels: StatsResult["levels"] = {};
  const levelBucket = (version: string, difficulty: string, level: string) => {
    levels[version] ??= {};
    levels[version][difficulty] ??= {};
    return levels[version][difficulty][level] ??= { ...emptyBucket(), charts: 0 };
  };

  for (const song of allSongs) {
    const version = song.addedVersion.toString();
    totalSongs[version] ??= {};
    totalSongs[version][song.difficulty] = (totalSongs[version][song.difficulty] ?? 0) + song.count;
    levelBucket(version, song.difficulty, song.level).charts += song.count;
  }

  const stats: StatsResult["stats"] = {};

  for (const score of scores) {
    const version = score.addedVersion.toString();
    stats[version] ??= {};
    addScore(stats[version][score.difficulty] ??= emptyBucket(), score);
    addScore(levelBucket(version, score.difficulty, score.level), score);
  }

  return { stats, totalSongs, levels };
}

export async function fetchPlayerStats(userId: string, region: Region): Promise<StatsResult> {
  const snapshot = await db
    .select({ id: userSnapshots.id, gameVersion: userSnapshots.gameVersion })
    .from(userSnapshots)
    .where(
      and(
        eq(userSnapshots.userId, userId),
        eq(userSnapshots.region, region)
      )
    )
    .orderBy(desc(userSnapshots.fetchedAt))
    .limit(1);

  if (snapshot.length === 0) {
    return { stats: {}, totalSongs: {}, levels: {} };
  }

  return computeStatsForSnapshot(snapshot[0].id, snapshot[0].gameVersion, region);
}
