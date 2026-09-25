import type { Region } from "@/lib/types";
import type { GameVersionInfo } from "./types";

export function versionAtDate(versions: readonly GameVersionInfo[], date: Date, region: Region, preferredVersion?: number): number {
  const sorted = [...versions].sort((a, b) => b.releaseDate.localeCompare(a.releaseDate) || b.id - a.id);
  if (!sorted.length) throw new Error(`No versions available for region ${region}`);
  const released = sorted.find(version => date.getTime() >= new Date(`${version.releaseDate.replaceAll("/", "-")}T07:00:00+09:00`).getTime());
  if (released && preferredVersion !== undefined) {
    const preferred = sorted.find(version => version.id === preferredVersion && version.releaseDate === released.releaseDate);
    if (preferred) return preferred.id;
  }
  return (released ?? sorted[sorted.length - 1]).id;
}
