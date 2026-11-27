import type { NetChartScore } from "../score";

export type WorldScore = Required<Pick<NetChartScore, "songName" | "level" | "difficultyCode" | "typeCode">>
  & Pick<NetChartScore, "cover" | "scoreValue" | "secondaryScore" | "comboStatus" | "syncStatus">
  & { levelPrecise: number };

// Status codes are ordinals: combo none, fc, fc+, ap, ap+ and sync none, sync, fs, fs+, fdx, fdx+.
export const WORLD_METRICS = {
  sssp: score => (score.scoreValue ?? 0) >= 1_005_000,
  sss: score => (score.scoreValue ?? 0) >= 1_000_000,
  s: score => (score.scoreValue ?? 0) >= 970_000,
  clear: score => (score.scoreValue ?? 0) >= 800_000,
  fc: score => (score.comboStatus ?? 0) >= 1,
  ap: score => (score.comboStatus ?? 0) >= 3,
  fdx: score => (score.syncStatus ?? 0) >= 4,
} as const satisfies Record<string, (score: WorldScore) => boolean>;

export type WorldMetric = keyof typeof WORLD_METRICS;
export const WORLD_METRIC_IDS = Object.keys(WORLD_METRICS) as WorldMetric[];
