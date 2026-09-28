import type { VersionId } from "@/lib/metadata";
import { parseDisplayLevel } from "../levels";

export const MAIMAI_LEVELS = [
  "1", "1+", "2", "2+", "3", "3+", "4", "4+", "5", "5+", "6", "6+",
  "7", "7+", "8", "8+", "9", "9+", "10", "10+", "11", "11+", "12", "12+",
  "13", "13+", "14", "14+", "15", "15+", "16", "16+",
] as const;
export type Level = (typeof MAIMAI_LEVELS)[number];

export function levelToPrecise(level: string, version: VersionId): number {
  return parseDisplayLevel(level, version >= 9 ? 6 : 7);
}
