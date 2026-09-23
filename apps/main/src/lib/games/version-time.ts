import type { Region } from "@/lib/types";
import type { GameVersionInfo } from "./types";

export function versionAtDate(versions: readonly GameVersionInfo[], date: Date, region: Region): number {
  const sorted = [...versions].sort((a, b) => b.releaseDate.localeCompare(a.releaseDate) || b.id - a.id);
  if (!sorted.length) throw new Error(`No versions available for region ${region}`);
  const released = sorted.find(version => date.getTime() >= new Date(`${version.releaseDate.replaceAll("/", "-")}T07:00:00+09:00`).getTime());
  return (released ?? sorted[sorted.length - 1]).id;
}
