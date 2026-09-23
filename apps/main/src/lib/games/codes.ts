import type { CanonicalGameId, GameCodeMaps } from "./types";

export const MAIMAI_TITLE_TYPE_CODES = {
  0: "normal",
  1: "bronze",
  2: "silver",
  3: "gold",
  4: "rainbow",
} as const;

export const RANKING_BUCKET_CODES = {
  1: "new",
  2: "old",
} as const;

export const GAME_CODE_MAPS: Record<CanonicalGameId, GameCodeMaps> = {
  maimai: {
    chartType: { 0: "standard", 1: "dx" },
    difficulty: { 0: "basic", 1: "advanced", 2: "expert", 3: "master", 4: "remaster", 5: "utage" },
    comboStatus: { 0: "none", 1: "fc", 2: "fc+", 3: "ap", 4: "ap+" },
    syncStatus: { 0: "none", 1: "sync", 2: "fs", 3: "fs+", 4: "fdx", 5: "fdx+" },
    clearStatus: { 0: "none" },
    titleType: MAIMAI_TITLE_TYPE_CODES,
    rankingBucket: RANKING_BUCKET_CODES,
  },
  chunithm: {
    chartType: { 0: "standard", 1: "worlds-end" },
    difficulty: { 0: "basic", 1: "advanced", 2: "expert", 3: "master", 4: "ultima", 5: "worlds-end" },
    comboStatus: { 0: "none", 1: "fc", 2: "aj", 3: "ajc" },
    syncStatus: { 0: "none", 1: "full-chain", 2: "full-chain-aj" },
    clearStatus: { 0: "none", 1: "clear", 2: "hard", 3: "brave", 4: "absolute", 5: "catastrophy" },
    titleType: { 0: "normal" },
    rankingBucket: RANKING_BUCKET_CODES,
  },
};
