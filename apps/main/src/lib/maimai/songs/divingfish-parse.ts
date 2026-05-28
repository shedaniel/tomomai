import { DIFFICULTY_ENUM } from "../../db/types";
import { logger } from "../../logger";
import type { Difficulty, FullCombo, FullSync, SongType } from "../../types";
import type { DivingFishRecord } from "../divingfish/client";
import type { ScoreData } from "../types";

const FC_MAP: Record<string, FullCombo> = {
  app: "ap+",
  ap: "ap",
  fcp: "fc+",
  fc: "fc",
};

const FS_MAP: Record<string, FullSync> = {
  fsdp: "fdx+",
  fsd: "fdx",
  fsp: "fs+",
  fs: "fs",
  sync: "sync",
};

function resolveMusicType(type: string | undefined): SongType | null {
  if (type === "DX") return "dx";
  if (type === "SD") return "std";
  return null;
}

function resolveDifficulty(
  levelIndex: number | undefined,
): { difficulty: Difficulty; difficultyNumber: number } | null {
  if (levelIndex === undefined || levelIndex < 0 || levelIndex > 4) return null;
  const difficulty = DIFFICULTY_ENUM[levelIndex] as Difficulty | undefined;
  if (!difficulty || difficulty === "utage") return null;
  return { difficulty, difficultyNumber: levelIndex };
}

export function parseDivingFishScoresData(
  records: DivingFishRecord[] | undefined,
): { [difficulty: number]: ScoreData[] } {
  const grouped: { [difficulty: number]: ScoreData[] } = {};
  if (!records) return grouped;

  for (const record of records) {
    const musicType = resolveMusicType(record.type);
    if (!musicType) {
      logger.debug(`[divingfish] skipping record with unknown type: ${record.type}`);
      continue;
    }

    const diff = resolveDifficulty(record.level_index);
    if (!diff) {
      logger.debug(`[divingfish] skipping record with invalid level_index: ${record.level_index}`);
      continue;
    }

    if (!record.title || !record.level) {
      logger.debug(`[divingfish] skipping record missing title or level (id=${record.song_id})`);
      continue;
    }

    const fc: FullCombo = record.fc ? (FC_MAP[record.fc] ?? "none") : "none";
    const fs: FullSync = record.fs ? (FS_MAP[record.fs] ?? "none") : "none";

    const entry: ScoreData = {
      songName: record.title,
      level: record.level,
      musicType,
      difficulty: diff.difficulty,
      difficultyNumber: diff.difficultyNumber,
      achievement: Math.round((record.achievements ?? 0) * 10000),
      dxScore: record.dxScore ?? 0,
      fc,
      fs,
    };

    if (!grouped[diff.difficultyNumber]) grouped[diff.difficultyNumber] = [];
    grouped[diff.difficultyNumber].push(entry);
  }

  return grouped;
}
