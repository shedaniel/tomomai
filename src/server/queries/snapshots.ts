import { db } from "@/lib/db";
import { scoreData, snapshotScores, songs, userEvents, userSnapshots } from "@/lib/db/schema-pg";
import { and, desc, eq } from "drizzle-orm";
import type { Region } from "@/lib/types";
import type { VersionId } from "@/lib/metadata";

export async function fetchUserSnapshots(userId: string, region: Region, options?: { limit?: number }) {
  let query = db
    .select({
      id: userSnapshots.publicId,
      fetchedAt: userSnapshots.fetchedAt,
      rating: userSnapshots.rating,
      displayName: userSnapshots.displayName,
      gameVersion: userSnapshots.gameVersion,
      courseRankUrl: userSnapshots.courseRankUrl,
      classRankUrl: userSnapshots.classRankUrl,
      stars: userSnapshots.stars,
      versionPlayCount: userSnapshots.versionPlayCount,
      totalPlayCount: userSnapshots.totalPlayCount,
    })
    .from(userSnapshots)
    .where(
      and(
        eq(userSnapshots.userId, userId),
        eq(userSnapshots.region, region)
      )
    )
    .orderBy(desc(userSnapshots.fetchedAt));

  if (options?.limit) {
    query = query.limit(options.limit) as typeof query;
  }

  const snapshots = await query;
  return snapshots.map((s) => ({ ...s, gameVersion: s.gameVersion as VersionId }));
}

export async function fetchSnapshotData(
  userId: string,
  snapshotPublicId: string,
  region: Region
) {
  const snapshot = await db
    .select()
    .from(userSnapshots)
    .where(
      and(
        eq(userSnapshots.publicId, snapshotPublicId),
        eq(userSnapshots.userId, userId),
        eq(userSnapshots.region, region)
      )
    )
    .limit(1);

  if (snapshot.length === 0) return null;

  const songsWithScores = await db
    .select({
      songId: songs.publicId,
      songName: songs.songName,
      artist: songs.artist,
      cover: songs.cover,
      difficulty: songs.difficulty,
      level: songs.level,
      levelPrecise: songs.levelPrecise,
      type: songs.type,
      genre: songs.genre,
      addedVersion: songs.addedVersion,
      achievement: scoreData.achievement,
      dxScore: scoreData.dxScore,
      fc: scoreData.fc,
      fs: scoreData.fs,
    })
    .from(snapshotScores)
    .innerJoin(scoreData, eq(snapshotScores.scoreId, scoreData.id))
    .innerJoin(songs, eq(scoreData.songId, songs.id))
    .where(eq(snapshotScores.snapshotId, snapshot[0].id))
    .orderBy(songs.songName, songs.difficulty);

  const events = await db
    .select({
      eventType: userEvents.eventType,
      name: userEvents.name,
      currentDistance: userEvents.currentDistance,
      nextRewardDistance: userEvents.nextRewardDistance,
      state: userEvents.state,
      imageUrl: userEvents.imageUrl,
      eventPeriodStart: userEvents.eventPeriodStart,
      eventPeriodEnd: userEvents.eventPeriodEnd,
    })
    .from(userEvents)
    .where(eq(userEvents.snapshotId, snapshot[0].id));

  return {
    snapshot: snapshot[0],
    songs: songsWithScores,
    events,
  };
}

export async function fetchLatestSnapshotData(userId: string, region: Region) {
  const snapshot = await db
    .select()
    .from(userSnapshots)
    .where(
      and(
        eq(userSnapshots.userId, userId),
        eq(userSnapshots.region, region)
      )
    )
    .orderBy(desc(userSnapshots.fetchedAt))
    .limit(1);

  if (snapshot.length === 0) return null;

  const songsWithScores = await db
    .select({
      songId: songs.publicId,
      songName: songs.songName,
      artist: songs.artist,
      cover: songs.cover,
      difficulty: songs.difficulty,
      level: songs.level,
      levelPrecise: songs.levelPrecise,
      type: songs.type,
      genre: songs.genre,
      addedVersion: songs.addedVersion,
      achievement: scoreData.achievement,
      dxScore: scoreData.dxScore,
      fc: scoreData.fc,
      fs: scoreData.fs,
    })
    .from(snapshotScores)
    .innerJoin(scoreData, eq(snapshotScores.scoreId, scoreData.id))
    .innerJoin(songs, eq(scoreData.songId, songs.id))
    .where(eq(snapshotScores.snapshotId, snapshot[0].id))
    .orderBy(songs.songName, songs.difficulty);

  const events = await db
    .select({
      eventType: userEvents.eventType,
      name: userEvents.name,
      currentDistance: userEvents.currentDistance,
      nextRewardDistance: userEvents.nextRewardDistance,
      state: userEvents.state,
      imageUrl: userEvents.imageUrl,
      eventPeriodStart: userEvents.eventPeriodStart,
      eventPeriodEnd: userEvents.eventPeriodEnd,
    })
    .from(userEvents)
    .where(eq(userEvents.snapshotId, snapshot[0].id));

  return {
    snapshot: snapshot[0],
    songs: songsWithScores,
    events,
  };
}
