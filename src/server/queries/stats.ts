import { db } from "@/lib/db";
import { songs, userScores, userSnapshots } from "@/lib/db/schema-pg";
import { and, desc, eq, sql } from "drizzle-orm";
import { getAchievementRate } from "@/lib/difficulty";
import type { Region } from "@/lib/types";

export type StatsResult = {
  stats: Record<string, Record<string, {
    grades: Record<string, number>;
    fc: Record<string, number>;
    fs: Record<string, number>;
    total: number;
  }>>;
  totalSongs: Record<string, Record<string, number>>;
};

export async function computeStatsForSnapshot(
  snapshotInternalId: bigint,
  gameVersion: number,
  region: Region
): Promise<StatsResult> {
  const scores = await db
    .select({
      achievement: userScores.achievement,
      addedVersion: songs.addedVersion,
      difficulty: songs.difficulty,
      fc: userScores.fc,
      fs: userScores.fs,
    })
    .from(userScores)
    .innerJoin(songs, eq(userScores.songId, songs.id))
    .where(eq(userScores.snapshotId, snapshotInternalId));

  const allSongs = await db
    .select({
      addedVersion: songs.addedVersion,
      difficulty: songs.difficulty,
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(songs)
    .where(
      and(
        eq(songs.region, region),
        eq(songs.gameVersion, gameVersion)
      )
    )
    .groupBy(songs.addedVersion, songs.difficulty);

  const totalSongs: Record<string, Record<string, number>> = {};
  for (const song of allSongs) {
    const version = song.addedVersion.toString();
    if (!totalSongs[version]) totalSongs[version] = {};
    totalSongs[version][song.difficulty] = song.count;
  }

  const stats: StatsResult["stats"] = {};

  for (const score of scores) {
    const version = score.addedVersion.toString();
    const difficulty = score.difficulty;

    if (!stats[version]) stats[version] = {};
    if (!stats[version][difficulty]) {
      stats[version][difficulty] = { grades: {}, fc: {}, fs: {}, total: 0 };
    }

    const grade = getAchievementRate(score.achievement);
    stats[version][difficulty].grades[grade] = (stats[version][difficulty].grades[grade] ?? 0) + 1;

    if (score.fc !== "none") {
      stats[version][difficulty].fc[score.fc] = (stats[version][difficulty].fc[score.fc] ?? 0) + 1;
    }
    if (score.fs !== "none") {
      stats[version][difficulty].fs[score.fs] = (stats[version][difficulty].fs[score.fs] ?? 0) + 1;
    }
    stats[version][difficulty].total++;
  }

  return { stats, totalSongs };
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
    return { stats: {}, totalSongs: {} };
  }

  return computeStatsForSnapshot(snapshot[0].id, snapshot[0].gameVersion, region);
}
