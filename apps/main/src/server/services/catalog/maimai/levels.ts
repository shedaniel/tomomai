import type { VersionId } from "@/lib/metadata";
import { parseDisplayLevel } from "../levels";

export function levelToPrecise(level: string, version: VersionId): number {
  return parseDisplayLevel(level, version >= 9 ? 6 : 7);
}
