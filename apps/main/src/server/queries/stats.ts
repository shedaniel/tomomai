import type { CanonicalGameId } from "@/lib/games/types";
import { GAME_CODE_MAPS, getGradeForGame } from "@/lib/games/codes";
import { db } from "@/lib/db";
import { parentSong, scoreData, snapshotScores, songs, userSnapshots } from "@/lib/db/schema-pg";
import { and, desc, eq, sql } from "drizzle-orm";
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

export async function computeStatsForSnapshotForGame(
  game: CanonicalGameId,
  snapshotInternalId: number,
  gameVersion: number,
  region: Region
): Promise<StatsResult> {
  const scores = await db
    .select({
      achievement: scoreData.scoreValue,
      addedVersion: songs.addedVersion,
      difficulty: sql`${parentSong.difficulty}`.mapWith(code => GAME_CODE_MAPS[game].difficulty[Number(code)] ?? String(code)).as("difficulty"),
      fc: sql`${scoreData.comboStatus}`.mapWith(code => GAME_CODE_MAPS[game].comboStatus[Number(code)] ?? String(code)).as("fc"),
      fs: sql`${scoreData.syncStatus}`.mapWith(code => GAME_CODE_MAPS[game].syncStatus[Number(code)] ?? String(code)).as("fs"),
    })
    .from(snapshotScores)
    .innerJoin(scoreData, eq(snapshotScores.scoreId, scoreData.id))
    .innerJoin(songs, eq(scoreData.songId, songs.id))
    .innerJoin(parentSong, eq(songs.parentId, parentSong.id))
    .where(and(eq(snapshotScores.game, game), eq(snapshotScores.snapshotId, snapshotInternalId)));

  const allSongs = await db
    .select({
      addedVersion: songs.addedVersion,
      difficulty: sql`${parentSong.difficulty}`.mapWith(code => GAME_CODE_MAPS[game].difficulty[Number(code)] ?? String(code)).as("difficulty"),
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(songs)
    .innerJoin(parentSong, eq(songs.parentId, parentSong.id))
    .where(
      and(
        and(eq(songs.game, game), eq(songs.region, region)),
        eq(songs.gameVersion, gameVersion)
      )
    )
    .groupBy(songs.addedVersion, parentSong.difficulty);

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

    const grade = getGradeForGame(game, score.achievement);
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

export async function fetchPlayerStatsForGame(game: CanonicalGameId, userId: string, region: Region): Promise<StatsResult> {
  const snapshot = await db
    .select({ id: userSnapshots.id, gameVersion: userSnapshots.gameVersion })
    .from(userSnapshots)
    .where(
      and(
        and(eq(userSnapshots.game, game), eq(userSnapshots.userId, userId)),
        and(eq(userSnapshots.game, game), eq(userSnapshots.region, region))
      )
    )
    .orderBy(desc(userSnapshots.fetchedAt))
    .limit(1);

  if (snapshot.length === 0) {
    return { stats: {}, totalSongs: {} };
  }

  return computeStatsForSnapshotForGame(game, snapshot[0].id, snapshot[0].gameVersion, region);
}

export function fetchPlayerStats(userId: string, region: Region) {
  return fetchPlayerStatsForGame("maimai", userId, region);
}

export function computeStatsForSnapshot(snapshotId: number, version: number, region: Region) {
  return computeStatsForSnapshotForGame("maimai", snapshotId, version, region);
}
