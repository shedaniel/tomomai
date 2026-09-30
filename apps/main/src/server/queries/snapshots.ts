import type { CanonicalGameId } from "@/lib/games/types";
import type { GameSnapshot, GameSnapshotData, GameSnapshotSummary } from "@/lib/games/player-view";
import { rateStoredRankings } from "@/lib/games/ranking";
import { songInstanceId } from "@/lib/db/song-instance-id";
import { db } from "@/lib/db";
import { parentSong, scoreData, snapshotRankings, snapshotScores, songs, userEvents, userSnapshots } from "@/lib/db/schema-pg";
import { and, desc, eq } from "drizzle-orm";
import type { Region } from "@/lib/types";
import { getLogger } from "@/lib/request-logger";
import { deleteFromR2, isR2IconUrl, r2KeyFromIconUrl } from "@/lib/r2";
import { latestSnapshot } from "./latest-snapshot";

export async function fetchUserSnapshots(
  game: CanonicalGameId,
  userId: string,
  region: Region,
  options?: { limit?: number },
): Promise<GameSnapshotSummary[]> {
  let query = db
    .select({
      publicId: userSnapshots.publicId,
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
        eq(userSnapshots.game, game),
        eq(userSnapshots.userId, userId),
        eq(userSnapshots.region, region)
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
export async function deleteUserSnapshot(
  game: CanonicalGameId,
  userId: string,
  snapshotPublicId: string,
  region: Region,
): Promise<{ deleted: boolean }> {
  const deleted = await db
    .delete(userSnapshots)
    .where(
      and(
        eq(userSnapshots.publicId, snapshotPublicId),
        eq(userSnapshots.game, game),
        eq(userSnapshots.userId, userId),
        eq(userSnapshots.region, region),
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
          getLogger().info({ url: key }, "Deleted orphan icon from R2");
        }
      }
    } catch (err) {
      getLogger().warn({ err, url: iconUrl }, "Failed to clean up orphan icon from R2");
    }
  }

  return { deleted: true };
}

/** The public snapshot header. The internal id, owner and raw metadata never leave the server. */
export const gameSnapshotColumns = {
  publicId: userSnapshots.publicId,
  game: userSnapshots.game,
  displayName: userSnapshots.displayName,
  rating: userSnapshots.rating,
  gameVersion: userSnapshots.gameVersion,
  fetchedAt: userSnapshots.fetchedAt,
  title: userSnapshots.title,
  titleType: userSnapshots.titleType,
  iconUrl: userSnapshots.iconUrl,
  courseRankUrl: userSnapshots.courseRankUrl,
  classRankUrl: userSnapshots.classRankUrl,
  stars: userSnapshots.stars,
  versionPlayCount: userSnapshots.versionPlayCount,
  totalPlayCount: userSnapshots.totalPlayCount,
};

const snapshotWithInternalId = { id: userSnapshots.id, snapshot: gameSnapshotColumns };

export async function fetchSnapshotData(
  game: CanonicalGameId,
  userId: string,
  snapshotPublicId: string,
  region: Region,
) {
  const [row] = await db
    .select(snapshotWithInternalId)
    .from(userSnapshots)
    .where(
      and(
        eq(userSnapshots.publicId, snapshotPublicId),
        eq(userSnapshots.game, game),
        eq(userSnapshots.userId, userId),
        eq(userSnapshots.region, region)
      )
    )
    .limit(1);

  return row ? readSnapshotData(row) : null;
}

/** The owner's snapshot in whichever region it was fetched, with that region. */
export async function fetchSnapshotDataByPublicId(game: CanonicalGameId, userId: string, snapshotPublicId: string) {
  const [row] = await db
    .select({ ...snapshotWithInternalId, region: userSnapshots.region })
    .from(userSnapshots)
    .where(
      and(
        eq(userSnapshots.publicId, snapshotPublicId),
        eq(userSnapshots.game, game),
        eq(userSnapshots.userId, userId),
      )
    )
    .limit(1);

  return row ? { region: row.region, ...await readSnapshotData(row) } : null;
}

const playerScoreColumns = {
  songId: songInstanceId,
  songName: parentSong.songName,
  artist: parentSong.artist,
  cover: parentSong.cover,
  difficultyCode: parentSong.difficulty,
  typeCode: parentSong.type,
  level: songs.level,
  levelPrecise: songs.levelPrecise,
  genre: parentSong.genre,
  addedVersion: songs.addedVersion,
  scoreValue: scoreData.scoreValue,
  secondaryScore: scoreData.secondaryScore,
  comboStatus: scoreData.comboStatus,
  syncStatus: scoreData.syncStatus,
  clearStatus: scoreData.clearStatus,
};

async function readSnapshotData<S extends GameSnapshot>({ id: snapshotId, snapshot }: { id: number; snapshot: S }) {
  const songsWithScores = await db
    .select(playerScoreColumns)
    .from(snapshotScores)
    .innerJoin(scoreData, eq(snapshotScores.scoreId, scoreData.id))
    .innerJoin(songs, eq(scoreData.songId, songs.id))
    .innerJoin(parentSong, eq(songs.parentId, parentSong.id))
    .where(eq(snapshotScores.snapshotId, snapshotId))
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
    .where(eq(userEvents.snapshotId, snapshotId));

  return {
    snapshot,
    songs: songsWithScores,
    events,
  } satisfies GameSnapshotData;
}

export async function fetchLatestSnapshotData(game: CanonicalGameId, userId: string, region: Region) {
  const row = await latestSnapshot(game, userId, region, snapshotWithInternalId);
  return row ? readSnapshotData(row) : null;
}

/** The rating selection stored when the owner's snapshot was written, rated with the current chart constants. */
export async function fetchSnapshotRankings(game: CanonicalGameId, userId: string, snapshot: Pick<GameSnapshot, "publicId" | "gameVersion">) {
  const rows = await db
    .select({ ...playerScoreColumns, bucket: snapshotRankings.bucket })
    .from(snapshotRankings)
    .innerJoin(userSnapshots, eq(snapshotRankings.snapshotId, userSnapshots.id))
    .innerJoin(scoreData, eq(snapshotRankings.scoreId, scoreData.id))
    .innerJoin(songs, eq(scoreData.songId, songs.id))
    .innerJoin(parentSong, eq(songs.parentId, parentSong.id))
    .where(and(
      eq(userSnapshots.publicId, snapshot.publicId),
      eq(userSnapshots.game, game),
      eq(userSnapshots.userId, userId),
    ))
    .orderBy(snapshotRankings.bucket, snapshotRankings.rank);
  return rateStoredRankings(game, rows, snapshot.gameVersion);
}
