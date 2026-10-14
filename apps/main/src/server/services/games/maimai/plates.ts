import "server-only";
import { difficultyToCode } from "@/lib/games/maimai/codes";
import { songInstanceId } from "@/lib/db/song-instance-id";
import { db } from "@/lib/db";
import { parentSong, scoreData, snapshotScores, songs, userSnapshots } from "@/lib/db/schema-pg";
import { and, eq } from "drizzle-orm";
import type { Region } from "@/lib/games/ids";
import { meetsMaimaiPlate, type MaimaiPlateDifficulty, type MaimaiPlateType } from "@/lib/games/maimai/plates";
import { latestSnapshot } from "@/server/queries/latest-snapshot";

export type PlateQuery = {
  version: string;
  difficulty: MaimaiPlateDifficulty;
  plateType: MaimaiPlateType;
};

/** The charts of one version and difficulty that the snapshot has not yet cleared for the plate. Unplayed charts read as zero scores. */
export async function fetchPlateSongs(
  snapshot: { id: number; gameVersion: number },
  region: Region,
  { version, difficulty, plateType }: PlateQuery,
) {
  const snapshotScoresSub = db
    .select({
      songId: scoreData.songId,
      scoreValue: scoreData.scoreValue,
      secondaryScore: scoreData.secondaryScore,
      comboStatus: scoreData.comboStatus,
      syncStatus: scoreData.syncStatus,
      clearStatus: scoreData.clearStatus,
    })
    .from(snapshotScores)
    .innerJoin(scoreData, eq(snapshotScores.scoreId, scoreData.id))
    .where(eq(snapshotScores.snapshotId, snapshot.id))
    .as("snapshot_scores_sub");

  const rows = await db
    .select({
      songId: songInstanceId,
      songName: parentSong.songName,
      artist: parentSong.artist,
      cover: parentSong.cover,
      difficultyCode: parentSong.difficulty,
      typeCode: parentSong.type,
      levelPrecise: songs.levelPrecise,
      scoreValue: snapshotScoresSub.scoreValue,
      secondaryScore: snapshotScoresSub.secondaryScore,
      comboStatus: snapshotScoresSub.comboStatus,
      syncStatus: snapshotScoresSub.syncStatus,
      clearStatus: snapshotScoresSub.clearStatus,
    })
    .from(songs)
    .innerJoin(parentSong, eq(songs.parentId, parentSong.id))
    .leftJoin(snapshotScoresSub, eq(snapshotScoresSub.songId, songs.id))
    .where(and(
      eq(songs.game, "maimai"),
      eq(songs.region, region),
      eq(songs.gameVersion, snapshot.gameVersion),
      eq(songs.addedVersion, parseInt(version)),
      eq(parentSong.difficulty, difficultyToCode(difficulty)),
    ));

  return rows
    .map(row => ({
      ...row,
      scoreValue: row.scoreValue ?? 0,
      secondaryScore: row.secondaryScore ?? 0,
      comboStatus: row.comboStatus ?? 0,
      syncStatus: row.syncStatus ?? 0,
      clearStatus: row.clearStatus ?? 0,
    }))
    .filter(score => !meetsMaimaiPlate(plateType, score));
}

/** fetchPlateSongs against the user's latest snapshot in the region, or nothing when they have none. */
export async function fetchLatestPlateSongs(userId: string, region: Region, query: PlateQuery) {
  const snapshot = await latestSnapshot("maimai", userId, region, { id: userSnapshots.id, gameVersion: userSnapshots.gameVersion });
  return snapshot ? fetchPlateSongs(snapshot, region, query) : [];
}
