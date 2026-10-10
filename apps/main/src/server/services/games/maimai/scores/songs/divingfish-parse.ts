import { MAIMAI_CODES } from "@/lib/games/maimai/codes";
import type { Difficulty, FullCombo, FullSync, SongType } from "@/lib/games/maimai/types";
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

function resolveDifficulty(levelIndex: number | undefined): Difficulty | null {
  if (levelIndex === undefined || levelIndex < 0 || levelIndex > 4) return null;
  const difficulty = MAIMAI_CODES.difficulty[levelIndex] as Difficulty | undefined;
  if (!difficulty || difficulty === "utage") return null;
  return difficulty;
}

export function parseDivingFishScoresData(records: DivingFishRecord[] | undefined): ScoreData[] {
  const parsed: ScoreData[] = [];
  if (!records) return parsed;

  for (const record of records) {
    const musicType = resolveMusicType(record.type);
    const difficulty = resolveDifficulty(record.level_index);
    if (!musicType || !difficulty || !record.title || !record.level) continue;

    const fc: FullCombo = record.fc ? (FC_MAP[record.fc] ?? "none") : "none";
    const fs: FullSync = record.fs ? (FS_MAP[record.fs] ?? "none") : "none";

    parsed.push({
      songName: record.title,
      level: record.level,
      musicType,
      difficulty,
      achievement: Math.round((record.achievements ?? 0) * 10000),
      dxScore: record.dxScore ?? 0,
      fc,
      fs,
    });
  }

  return parsed;
}
