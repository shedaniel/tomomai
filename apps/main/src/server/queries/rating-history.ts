import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { parentSong, scoreData, snapshotRankings, songs, userSnapshots } from "@/lib/db/schema-pg";
import { rateStoredRankings } from "@/lib/games/ranking";
import type { CanonicalGameId, Region } from "@/lib/games/ids";

type HistorySnapshot = Pick<typeof userSnapshots.$inferSelect, "id" | "fetchedAt" | "rating" | "gameVersion">;
type HistoryScore = {
  snapshotId: number;
  bucket: number;
  parentId: bigint;
  songName: string;
  cover: string;
  difficultyCode: number;
  levelPrecise: number;
  scoreValue: number;
  comboStatus: number;
};
type RatingChange = {
  songName: string;
  cover: string;
  difficultyCode: number;
  oldRating?: number;
  newRating: number;
  changeType: "new" | "improved";
};

function dailySnapshots(snapshots: HistorySnapshot[]) {
  const days = new Map<string, HistorySnapshot>();
  for (const snapshot of snapshots) days.set(snapshot.fetchedAt.toISOString().slice(0, 10), snapshot);
  return [...days.values()];
}

/** `scores` are each snapshot's stored ranking rows, in bucket and rank order. */
function buildRatingHistory(game: CanonicalGameId, snapshots: HistorySnapshot[], scores: HistoryScore[]) {
  const bySnapshot = new Map<number, HistoryScore[]>();
  for (const score of scores) {
    const entries = bySnapshot.get(score.snapshotId) ?? [];
    entries.push(score);
    bySnapshot.set(score.snapshotId, entries);
  }
  const changesBySnapshot = new Map<number, RatingChange[]>();
  const bestScores = (snapshot: HistorySnapshot) => {
    const { newScores, oldScores } = rateStoredRankings(game, bySnapshot.get(snapshot.id) ?? [], snapshot.gameVersion);
    return [...newScores, ...oldScores];
  };
  const days = dailySnapshots(snapshots);
  for (let index = 1; index < days.length; index++) {
    const current = days[index];
    const previous = days[index - 1];
    if (current.rating <= previous.rating) continue;
    const currentScores = bestScores(current);
    const previousScores = bestScores(previous);
    if (!currentScores.length || !previousScores.length) continue;
    const previousRatings = new Map(previousScores.map(score => [score.parentId, score.rating]));
    const changes: RatingChange[] = [];
    for (const score of currentScores) {
      const oldRating = previousRatings.get(score.parentId);
      if (oldRating !== undefined && score.rating <= oldRating) continue;
      changes.push({
        songName: score.songName,
        cover: score.cover,
        difficultyCode: score.difficultyCode,
        oldRating,
        newRating: score.rating,
        changeType: oldRating === undefined ? "new" : "improved",
      });
    }
    changesBySnapshot.set(current.id, changes);
  }
  return { history: snapshots.map(snapshot => ({
    date: snapshot.fetchedAt,
    rating: snapshot.rating,
    changes: changesBySnapshot.get(snapshot.id) ?? [],
  })) };
}

export async function fetchRatingHistory(game: CanonicalGameId, userId: string, region: Region) {
  const snapshots = await db.select({
    id: userSnapshots.id,
    fetchedAt: userSnapshots.fetchedAt,
    rating: userSnapshots.rating,
    gameVersion: userSnapshots.gameVersion,
  }).from(userSnapshots).where(and(
    eq(userSnapshots.game, game), eq(userSnapshots.userId, userId), eq(userSnapshots.region, region),
  )).orderBy(userSnapshots.fetchedAt, userSnapshots.id);
  const days = dailySnapshots(snapshots);
  const needed = new Set<number>();
  for (let index = 1; index < days.length; index++) {
    if (days[index].rating > days[index - 1].rating) {
      needed.add(days[index - 1].id);
      needed.add(days[index].id);
    }
  }
  if (!needed.size) return buildRatingHistory(game, snapshots, []);
  const scores = await db.select({
    snapshotId: snapshotRankings.snapshotId,
    bucket: snapshotRankings.bucket,
    parentId: parentSong.id,
    songName: parentSong.songName,
    cover: parentSong.cover,
    difficultyCode: parentSong.difficulty,
    levelPrecise: songs.levelPrecise,
    scoreValue: scoreData.scoreValue,
    comboStatus: scoreData.comboStatus,
  }).from(snapshotRankings)
    .innerJoin(scoreData, eq(snapshotRankings.scoreId, scoreData.id))
    .innerJoin(songs, eq(scoreData.songId, songs.id))
    .innerJoin(parentSong, eq(songs.parentId, parentSong.id))
    .where(and(eq(songs.region, region), inArray(snapshotRankings.snapshotId, [...needed])))
    .orderBy(snapshotRankings.snapshotId, snapshotRankings.bucket, snapshotRankings.rank);
  return buildRatingHistory(game, snapshots, scores);
}
