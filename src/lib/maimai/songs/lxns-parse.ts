import { DIFFICULTY_ENUM } from "../../db/types";
import { logger } from "../../logger";
import type { Difficulty, FullCombo, FullSync, SongType } from "../../types";
import type { ScoreData } from "../types";

export interface LxnsScore {
  id?: number;
  song_name?: string;
  level?: string;
  level_index?: number;
  achievements?: number;
  fc?: string | null;
  fs?: string | null;
  dx_score?: number;
  type?: string;
}

export interface LxnsScoresResponse {
  scores?: LxnsScore[];
}

export function unwrapLxnsScoresResponse(json: Record<string, unknown>): LxnsScore[] {
  const root = (json.data as LxnsScoresResponse | LxnsScore[] | undefined) ?? json;
  if (Array.isArray(root)) return root as LxnsScore[];
  if (Array.isArray((root as LxnsScoresResponse).scores)) return (root as LxnsScoresResponse).scores!;
  return [];
}

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

// lxns level_index → our (Difficulty, difficultyNumber).
// utage scores have type="utage" and level_index defaults to 0; keep our
// scrape convention of difficultyNumber=10 for utage.
function resolveDifficulty(
  type: string | undefined,
  levelIndex: number | undefined,
): { difficulty: Difficulty; difficultyNumber: number } | null {
  if (type === "utage") {
    return { difficulty: "utage", difficultyNumber: 10 };
  }
  if (levelIndex === undefined || levelIndex < 0 || levelIndex > 4) return null;
  const difficulty = DIFFICULTY_ENUM[levelIndex] as Difficulty | undefined;
  if (!difficulty || difficulty === "utage") return null;
  return { difficulty, difficultyNumber: levelIndex };
}

function resolveMusicType(type: string | undefined): SongType | null {
  if (type === "standard") return "std";
  if (type === "dx") return "dx";
  if (type === "utage") return "dx";
  return null;
}

export function parseLxnsScoresData(scores: LxnsScore[]): { [difficulty: number]: ScoreData[] } {
  const grouped: { [difficulty: number]: ScoreData[] } = {};

  for (const score of scores) {
    const musicType = resolveMusicType(score.type);
    if (!musicType) {
      logger.debug(`[lxns] skipping score with unknown type: ${score.type}`);
      continue;
    }

    const diff = resolveDifficulty(score.type, score.level_index);
    if (!diff) {
      logger.debug(`[lxns] skipping score with invalid level_index: ${score.level_index}`);
      continue;
    }

    if (!score.song_name || !score.level) {
      logger.debug(`[lxns] skipping score missing song_name or level (id=${score.id})`);
      continue;
    }

    const fc: FullCombo = score.fc ? (FC_MAP[score.fc] ?? "none") : "none";
    const fs: FullSync = score.fs ? (FS_MAP[score.fs] ?? "none") : "none";

    const entry: ScoreData = {
      songName: score.song_name,
      level: score.level,
      musicType,
      difficulty: diff.difficulty,
      difficultyNumber: diff.difficultyNumber,
      achievement: Math.round((score.achievements ?? 0) * 10000),
      dxScore: score.dx_score ?? 0,
      fc,
      fs,
    };

    if (!grouped[diff.difficultyNumber]) grouped[diff.difficultyNumber] = [];
    grouped[diff.difficultyNumber].push(entry);
  }

  return grouped;
}
