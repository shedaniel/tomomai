import type { Difficulty } from "./types";

export const MAIMAI_PLATE_TYPES = ["kiwami", "shou", "shin", "maimai"] as const;
export type MaimaiPlateType = (typeof MAIMAI_PLATE_TYPES)[number];

/** Plates are earned on these difficulties only. */
export const MAIMAI_PLATE_DIFFICULTIES = ["basic", "advanced", "expert", "master"] as const satisfies readonly Difficulty[];
export type MaimaiPlateDifficulty = (typeof MAIMAI_PLATE_DIFFICULTIES)[number];
