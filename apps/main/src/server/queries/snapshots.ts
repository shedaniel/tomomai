import type { CanonicalGameId } from "@/lib/games/types";
import { codeToChartType, codeToComboStatus, codeToDifficulty, codeToSyncStatus, codeToTitleType } from "@/lib/maimai/codes";
import { songInstanceId } from "@/lib/db/song-instance-id";
import { db } from "@/lib/db";
import { parentSong, scoreData, snapshotScores, songs, userEvents, userSnapshots } from "@/lib/db/schema-pg";
import { and, desc, eq } from "drizzle-orm";
import type { Region } from "@/lib/types";
import type { VersionId } from "@/lib/metadata";
import { logger } from "@/lib/logger";
import { deleteFromR2, isR2IconUrl, r2KeyFromIconUrl } from "@/lib/r2";

export async function fetchUserSnapshots(game: CanonicalGameId, userId: string, region: Region, options?: { limit?: number }) {
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
        and(eq(userSnapshots.game, game), eq(userSnapshots.userId, userId)),
        and(eq(userSnapshots.game, game), eq(userSnapshots.region, region))
      )
    )
    .orderBy(desc(userSnapshots.fetchedAt));

  if (options?.limit) {
    query = query.limit(options.limit) as typeof query;
  }

  const snapshots = await query;
  return snapshots;
}

/**
 * Delete one of the user's snapshots and clean up its R2 icon if no other
 * snapshot still references it. Returns `{ deleted: false }` when the
 * snapshot doesn't exist or doesn't belong to the user; callers translate
 * that into a 404.
 */
export async function deleteUserSnapshot(game: CanonicalGameId,
  userId: string,
  snapshotPublicId: string,
  region: Region,
): Promise<{ deleted: boolean }> {
  const deleted = await db
    .delete(userSnapshots)
    .where(
      and(
        eq(userSnapshots.publicId, snapshotPublicId),
        and(eq(userSnapshots.game, game), eq(userSnapshots.userId, userId)),
        and(eq(userSnapshots.game, game), eq(userSnapshots.region, region)),
      ),
    )
    .returning({ iconUrl: userSnapshots.iconUrl });

  if (deleted.length === 0) return { deleted: false };

  const iconUrl = deleted[0].iconUrl;
  if (iconUrl && isR2IconUrl(iconUrl)) {
    try {
      const stillUsed = await db
        .select({ id: userSnapshots.id })
        .from(userSnapshots)
        .where(eq(userSnapshots.iconUrl, iconUrl))
        .limit(1);
      if (stillUsed.length === 0) {
        const key = r2KeyFromIconUrl(iconUrl);
        if (key) {
          await deleteFromR2(key);
          logger.info(`Deleted orphan icon from R2: ${key}`);
        }
      }
    } catch (err) {
      logger.warn({ err, url: iconUrl }, "Failed to clean up orphan icon from R2");
    }
  }

  return { deleted: true };
}

export async function fetchSnapshotData(game: CanonicalGameId,
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
        and(eq(userSnapshots.game, game), eq(userSnapshots.userId, userId)),
        and(eq(userSnapshots.game, game), eq(userSnapshots.region, region))
      )
    )
    .limit(1);

  if (snapshot.length === 0) return null;

  const songsWithScores = await db
    .select({
      songId: songInstanceId,
      songName: parentSong.songName,
      artist: parentSong.artist,
      cover: parentSong.cover,
      difficultyCode: parentSong.difficulty,
      typeCode: parentSong.type,
      difficulty: parentSong.difficulty,
      level: songs.level,
      levelPrecise: songs.levelPrecise,
      type: parentSong.type,
      genre: parentSong.genre,
      addedVersion: songs.addedVersion,
      scoreValue: scoreData.scoreValue,
      secondaryScore: scoreData.secondaryScore,
      comboStatus: scoreData.comboStatus,
      syncStatus: scoreData.syncStatus,
      clearStatus: scoreData.clearStatus,
      achievement: scoreData.scoreValue,
      dxScore: scoreData.secondaryScore,
      fc: scoreData.comboStatus,
      fs: scoreData.syncStatus,
    })
    .from(snapshotScores)
    .innerJoin(scoreData, eq(snapshotScores.scoreId, scoreData.id))
    .innerJoin(songs, eq(scoreData.songId, songs.id))
    .innerJoin(parentSong, eq(songs.parentId, parentSong.id))
    .where(and(eq(snapshotScores.game, game), eq(snapshotScores.snapshotId, snapshot[0].id)))
    .orderBy(parentSong.songName, parentSong.difficulty);

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
    .where(and(eq(userEvents.game, game), eq(userEvents.snapshotId, snapshot[0].id)));

  return {
    snapshot: snapshot[0],
    songs: songsWithScores,
    events,
  };
}

/**
 * Return the `fetchedAt` of the user's newest snapshot for a region, or null
 * if they have none. Cheap single-column query used for staleness checks.
 */
export async function getLatestSnapshotFetchedAt(game: CanonicalGameId,
  userId: string,
  region: Region,
): Promise<Date | null> {
  const [row] = await db
    .select({ fetchedAt: userSnapshots.fetchedAt })
    .from(userSnapshots)
    .where(
      and(
        and(eq(userSnapshots.game, game), eq(userSnapshots.userId, userId)),
        and(eq(userSnapshots.game, game), eq(userSnapshots.region, region)),
      ),
    )
    .orderBy(desc(userSnapshots.fetchedAt))
    .limit(1);
  return row?.fetchedAt ?? null;
}

export async function fetchLatestSnapshotData(game: CanonicalGameId, userId: string, region: Region) {
  const snapshot = await db
    .select()
    .from(userSnapshots)
    .where(
      and(
        and(eq(userSnapshots.game, game), eq(userSnapshots.userId, userId)),
        and(eq(userSnapshots.game, game), eq(userSnapshots.region, region))
      )
    )
    .orderBy(desc(userSnapshots.fetchedAt))
    .limit(1);

  if (snapshot.length === 0) return null;

  const songsWithScores = await db
    .select({
      songId: songInstanceId,
      songName: parentSong.songName,
      artist: parentSong.artist,
      cover: parentSong.cover,
      difficultyCode: parentSong.difficulty,
      typeCode: parentSong.type,
      difficulty: parentSong.difficulty,
      level: songs.level,
      levelPrecise: songs.levelPrecise,
      type: parentSong.type,
      genre: parentSong.genre,
      addedVersion: songs.addedVersion,
      scoreValue: scoreData.scoreValue,
      secondaryScore: scoreData.secondaryScore,
      comboStatus: scoreData.comboStatus,
      syncStatus: scoreData.syncStatus,
      clearStatus: scoreData.clearStatus,
      achievement: scoreData.scoreValue,
      dxScore: scoreData.secondaryScore,
      fc: scoreData.comboStatus,
      fs: scoreData.syncStatus,
    })
    .from(snapshotScores)
    .innerJoin(scoreData, eq(snapshotScores.scoreId, scoreData.id))
    .innerJoin(songs, eq(scoreData.songId, songs.id))
    .innerJoin(parentSong, eq(songs.parentId, parentSong.id))
    .where(and(eq(snapshotScores.game, game), eq(snapshotScores.snapshotId, snapshot[0].id)))
    .orderBy(parentSong.songName, parentSong.difficulty);

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
    .where(and(eq(userEvents.game, game), eq(userEvents.snapshotId, snapshot[0].id)));

  return {
    snapshot: snapshot[0],
    songs: songsWithScores,
    events,
  };
}






function toMaimaiSnapshot(snapshot: typeof userSnapshots.$inferSelect) {
  return { ...snapshot, titleTypeCode: snapshot.titleType, titleType: codeToTitleType(snapshot.titleType),
    courseRankUrl: snapshot.courseRankUrl ?? "", classRankUrl: snapshot.classRankUrl ?? "", stars: snapshot.stars ?? 0 };
}


function toMaimaiSnapshotResult(result: Awaited<ReturnType<typeof fetchSnapshotData>>) {
  if (!result) return null;
  return {
    snapshot: toMaimaiSnapshot(result.snapshot),
    songs: result.songs.map(song => ({ ...song, difficulty: codeToDifficulty(song.difficultyCode), type: codeToChartType(song.typeCode), fc: codeToComboStatus(song.comboStatus), fs: codeToSyncStatus(song.syncStatus) })),
    events: result.events.map(event => ({ ...event, eventType: event.eventType ?? "eventArea" as const, currentDistance: event.currentDistance ?? 0, state: event.state ?? "not_started" as const, imageUrl: event.imageUrl ?? "" })),
  };
}

export async function fetchMaimaiUserSnapshots(userId: string, region: Region, options?: { limit?: number }) {
  const snapshots = await fetchUserSnapshots("maimai", userId, region, options);
  return snapshots.map(s => ({ ...s, courseRankUrl: s.courseRankUrl ?? "", classRankUrl: s.classRankUrl ?? "", stars: s.stars ?? 0, gameVersion: s.gameVersion as VersionId }));
}

export function deleteMaimaiUserSnapshot(userId: string, snapshotPublicId: string, region: Region) {
  return deleteUserSnapshot("maimai", userId, snapshotPublicId, region);
}

export async function fetchMaimaiSnapshotData(userId: string, snapshotPublicId: string, region: Region) {
  return toMaimaiSnapshotResult(await fetchSnapshotData("maimai", userId, snapshotPublicId, region));
}

export async function fetchLatestMaimaiSnapshotData(userId: string, region: Region) {
  return toMaimaiSnapshotResult(await fetchLatestSnapshotData("maimai", userId, region));
}

export function getLatestMaimaiSnapshotFetchedAt(userId: string, region: Region) {
  return getLatestSnapshotFetchedAt("maimai", userId, region);
}
