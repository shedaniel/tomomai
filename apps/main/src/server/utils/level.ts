import type { VersionId } from "@/lib/metadata";
import { parseDisplayLevel } from "@/server/services/catalog/ingestion/levels";

export function levelToPrecise(level: string, version: VersionId): number {
  return parseDisplayLevel(level, version >= 9 ? 6 : 7);
}
