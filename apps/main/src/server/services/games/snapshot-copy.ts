import "server-only";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { scoreData, snapshotScores, songs, userSnapshots } from "@/lib/db/schema-pg";
import { getGame } from "@/lib/games/registry";
import type { CanonicalGameId, Region } from "@/lib/games/ids";
import { catalogCharts, writeSnapshotScores, type SnapshotScore } from "./score-storage";

export type CopySnapshotInput = {
  game: CanonicalGameId;
  userId: string;
  snapshotPublicId: string;
  region: Region;
  targetVersion: number;
};

/**
 * Copies a snapshot's scores onto the target version's charts as a new snapshot, in one transaction.
 * Returns null when the user has no such snapshot.
 */
export async function copySnapshotToVersion(input: CopySnapshotInput) {
  return db.transaction(async tx => {
    const [source] = await tx.select().from(userSnapshots).where(and(
      eq(userSnapshots.publicId, input.snapshotPublicId),
      eq(userSnapshots.game, input.game),
      eq(userSnapshots.userId, input.userId),
      eq(userSnapshots.region, input.region),
    )).limit(1);
    if (!source) return null;

    const publicId = nanoid();
    const [copy] = await tx.insert(userSnapshots).values({
      game: input.game,
      publicId,
      userId: input.userId,
      region: input.region,
      fetchedAt: new Date(source.fetchedAt.getTime() + 1000),
      gameVersion: input.targetVersion,
      rating: source.rating,
      courseRankUrl: source.courseRankUrl,
      classRankUrl: source.classRankUrl,
      stars: source.stars,
      versionPlayCount: 0,
      totalPlayCount: source.totalPlayCount,
      iconUrl: source.iconUrl,
      displayName: source.displayName,
      title: source.title,
      titleType: source.titleType,
    }).returning({ id: userSnapshots.id });

    const sourceScores = await tx.select({
      parentId: songs.parentId,
      scoreValue: scoreData.scoreValue,
      secondaryScore: scoreData.secondaryScore,
      comboStatus: scoreData.comboStatus,
      syncStatus: scoreData.syncStatus,
      clearStatus: scoreData.clearStatus,
    }).from(snapshotScores)
      .innerJoin(scoreData, eq(snapshotScores.scoreId, scoreData.id))
      .innerJoin(songs, eq(scoreData.songId, songs.id))
      .where(eq(snapshotScores.snapshotId, source.id));

    const targetCharts = await catalogCharts(tx, input.game, input.region, input.targetVersion);
    const targetByParent = new Map(targetCharts.map(song => [song.parentId, song]));
    const scores = sourceScores.flatMap(({ parentId, ...values }): SnapshotScore[] => {
      const song = targetByParent.get(parentId);
      return song ? [{ song, values: { ...values, songId: song.id } }] : [];
    });

    const ranking = await writeSnapshotScores(tx, { game: input.game, snapshotId: copy.id, gameVersion: input.targetVersion, scores });
    let rating = source.rating;
    if (ranking) {
      rating = getGame(input.game).rating.playerRating([...ranking.newScores, ...ranking.oldScores].map(score => score.rating));
      await tx.update(userSnapshots).set({ rating }).where(eq(userSnapshots.id, copy.id));
    }

    return {
      newSnapshotId: publicId,
      copiedScores: scores.length,
      totalOriginalScores: sourceScores.length,
      originalRating: source.rating,
      newRating: rating,
    };
  });
}
