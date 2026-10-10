import { comboStatusToCode, syncStatusToCode } from "./codes";
import { MAIMAI_GRADES } from "./grades";
import { MAIMAI_ALL_PERFECT } from "./rating";
import type { Difficulty, FullCombo, FullSync } from "./types";

export const MAIMAI_PLATE_TYPES = ["kiwami", "shou", "shin", "maimai"] as const;
export type MaimaiPlateType = (typeof MAIMAI_PLATE_TYPES)[number];

/** Plates are earned on these difficulties only. */
export const MAIMAI_PLATE_DIFFICULTIES = ["basic", "advanced", "expert", "master"] as const satisfies readonly Difficulty[];
export type MaimaiPlateDifficulty = (typeof MAIMAI_PLATE_DIFFICULTIES)[number];

/** What each chart of a version must reach for the plate. */
export type MaimaiPlateRequirement =
  | { comboStatus: readonly FullCombo[] }
  | { syncStatus: readonly FullSync[] }
  | { minScore: number };

export const MAIMAI_PLATE_REQUIREMENTS: Readonly<Record<MaimaiPlateType, MaimaiPlateRequirement>> = {
  kiwami: { comboStatus: ["fc", "fc+", ...MAIMAI_ALL_PERFECT] },
  shou: { minScore: MAIMAI_GRADES.find(grade => grade.label === "SSS")!.min },
  shin: { comboStatus: MAIMAI_ALL_PERFECT },
  maimai: { syncStatus: ["fdx", "fdx+"] },
};

export function meetsMaimaiPlate(plate: MaimaiPlateType, score: { scoreValue: number; comboStatus: number; syncStatus: number }): boolean {
  const requirement = MAIMAI_PLATE_REQUIREMENTS[plate];
  if ("comboStatus" in requirement) return requirement.comboStatus.some(key => comboStatusToCode(key) === score.comboStatus);
  if ("syncStatus" in requirement) return requirement.syncStatus.some(key => syncStatusToCode(key) === score.syncStatus);
  return score.scoreValue >= requirement.minScore;
}
