import "server-only";
import { comboStatusToCode, difficultyToCode, syncStatusToCode } from "@/lib/games/maimai/codes";
import { songInstanceId } from "@/lib/db/song-instance-id";
import { db } from "@/lib/db";
import { parentSong, scoreData, snapshotScores, songs } from "@/lib/db/schema-pg";
import { and, eq } from "drizzle-orm";
import type { Region } from "@/lib/types";
import type { Difficulty } from "@/lib/games/maimai/types";
import type { GamePlayerScore } from "@/lib/games/player-view";

type PlateType = "kiwami" | "shou" | "shin" | "maimai";

const FULL_COMBO = new Set((["fc", "fc+", "ap", "ap+"] as const).map(comboStatusToCode));
const ALL_PERFECT = new Set((["ap", "ap+"] as const).map(comboStatusToCode));
const FULL_SYNC_DX = new Set((["fdx", "fdx+"] as const).map(syncStatusToCode));
const SSS = 1_000_000;

const PLATE_CLEARED: Record<PlateType, (score: Pick<GamePlayerScore, "scoreValue" | "comboStatus" | "syncStatus">) => boolean> = {
  kiwami: score => FULL_COMBO.has(score.comboStatus),
  shou: score => score.scoreValue >= SSS,
  shin: score => ALL_PERFECT.has(score.comboStatus),
  maimai: score => FULL_SYNC_DX.has(score.syncStatus),
};

/** The charts of one version and difficulty that the snapshot has not yet cleared for the plate. Unplayed charts read as zero scores. */
export async function fetchPlateSongs(
  snapshotInternalId: number,
  gameVersion: number,
  region: Region,
  version: string,
  difficulty: Difficulty,
  plateType: PlateType,
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
    .where(and(eq(snapshotScores.game, "maimai"), eq(snapshotScores.snapshotId, snapshotInternalId)))
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
      eq(songs.gameVersion, gameVersion),
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
    .filter(score => !PLATE_CLEARED[plateType](score));
}
