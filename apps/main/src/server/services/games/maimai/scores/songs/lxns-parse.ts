import { normalizeName } from "@/lib/name-utils";
import { MAIMAI_CODES } from "@/lib/games/maimai/codes";
import { logger } from "@/lib/logger";
import type { Difficulty, FullCombo, FullSync, SongType } from "@/lib/games/maimai/types";
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

// utage scores have type="utage" and a meaningless level_index of 0.
function resolveDifficulty(
  type: string | undefined,
  levelIndex: number | undefined,
): Difficulty | null {
  if (type === "utage") return "utage";
  if (levelIndex === undefined || levelIndex < 0 || levelIndex > 4) return null;
  const difficulty = MAIMAI_CODES.difficulty[levelIndex] as Difficulty | undefined;
  if (!difficulty || difficulty === "utage") return null;
  return difficulty;
}

const MUSIC_TYPE_MAP: Record<string, SongType> = {
  standard: "std",
  dx: "dx",
  utage: "dx",
};

function resolveMusicType(type: string | undefined): SongType | null {
  return type && Object.hasOwn(MUSIC_TYPE_MAP, type) ? MUSIC_TYPE_MAP[type] : null;
}

export function parseLxnsScoresData(scores: LxnsScore[]): ScoreData[] {
  const parsed: ScoreData[] = [];

  for (const score of scores) {
    const musicType = resolveMusicType(score.type);
    if (!musicType) {
      logger.debug(`[lxns] skipping score with unknown type: ${score.type}`);
      continue;
    }

    const difficulty = resolveDifficulty(score.type, score.level_index);
    if (!difficulty) {
      logger.debug(`[lxns] skipping score with invalid level_index: ${score.level_index}`);
      continue;
    }

    if (!score.song_name || !score.level) {
      logger.debug(`[lxns] skipping score missing song_name or level (id=${score.id})`);
      continue;
    }

    const fc: FullCombo = score.fc ? (FC_MAP[score.fc] ?? "none") : "none";
    const fs: FullSync = score.fs ? (FS_MAP[score.fs] ?? "none") : "none";

    parsed.push({
      songName: normalizeName(score.song_name),
      level: score.level,
      musicType,
      difficulty,
      achievement: Math.round((score.achievements ?? 0) * 10000),
      dxScore: score.dx_score ?? 0,
      fc,
      fs,
    });
  }

  return parsed;
}
