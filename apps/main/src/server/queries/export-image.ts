import { db } from "@/lib/db";
import { parentSong, scoreData, snapshotB50, songs, user, userSnapshots } from "@/lib/db/schema-pg";
import type { VersionId } from "@/lib/metadata";
import type { SongForRender } from "@/lib/render-image";
import type { Region, SnapshotWithSongs } from "@/lib/types";
import { eq } from "drizzle-orm";
import { getReservedSnapshotData } from "./reserved";

export type PrepareDataResult =
  | {
      type: "success";
      data: SnapshotWithSongs<SongForRender>;
      region: Region;
      visitableProfileAt: string | null;
    }
  | {
      type: "error";
      error: string;
    };

export async function prepareExportImageData(
  snapshotPublicId: string,
  reservedUsername?: string,
  reservedRegion?: Region
): Promise<PrepareDataResult> {
  // Handle reserved profiles
  if (reservedUsername && reservedRegion) {
    const reservedData = await getReservedSnapshotData(
      reservedUsername,
      reservedRegion
    );
    if (reservedData) {
      return {
        type: "success",
        data: {
          snapshot: {
            ...reservedData.snapshot,
            id: reservedData.snapshot.publicId,
            gameVersion: reservedData.snapshot.gameVersion as VersionId,
          },
          songs: reservedData.songs.map((s) => ({
            songName: s.songName,
            cover: s.cover,
            difficulty: s.difficulty,
            levelPrecise: s.levelPrecise,
            type: s.type,
            addedVersion: s.addedVersion,
            achievement: s.achievement,
            fc: s.fc,
            fs: s.fs,
          })),
        },
        region: reservedRegion,
        visitableProfileAt: reservedUsername,
      };
    }
  }

  // Normal DB path
  const snapshot = await db
    .select()
    .from(userSnapshots)
    .where(eq(userSnapshots.publicId, snapshotPublicId))
    .limit(1);

  if (snapshot.length === 0) {
    return { type: "error", error: "Snapshot not found" };
  }

  const [publishProfile, songsWithScores] = await Promise.all([
    db
      .select({
        username: user.username,
        publishProfile: user.publishProfile,
      })
      .from(user)
      .where(eq(user.id, snapshot[0].userId))
      .limit(1),
    db
      .select({
        songName: parentSong.songName,
        cover: parentSong.cover,
        difficulty: parentSong.difficulty,
        levelPrecise: songs.levelPrecise,
        type: parentSong.type,
        addedVersion: songs.addedVersion,
        achievement: scoreData.achievement,
        fc: scoreData.fc,
        fs: scoreData.fs,
      })
      .from(snapshotB50)
      .innerJoin(scoreData, eq(snapshotB50.scoreId, scoreData.id))
      .innerJoin(songs, eq(scoreData.songId, songs.id))
      .innerJoin(parentSong, eq(songs.parentId, parentSong.id))
      .where(eq(snapshotB50.snapshotId, snapshot[0].id))
      .orderBy(parentSong.songName, parentSong.difficulty),
  ]);

  if (publishProfile.length === 0) {
    return { type: "error", error: "User not found" };
  }

  const visitableProfileAt =
    publishProfile[0].publishProfile && publishProfile[0].username
      ? publishProfile[0].username
      : null;

  return {
    type: "success",
    data: {
      snapshot: {
        ...snapshot[0],
        id: snapshot[0].publicId,
        gameVersion: snapshot[0].gameVersion as VersionId,
      },
      songs: songsWithScores,
    },
    region: snapshot[0].region,
    visitableProfileAt,
  };
}
