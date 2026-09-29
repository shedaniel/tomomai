import type { Region } from "@/lib/types";
import type { CanonicalGameId, GameVersionInfo } from "./types";
import { getGame } from "./registry";
import { versionAtDate } from "./version-time";

export function getCurrentVersion(game: CanonicalGameId, region: Region): number {
  return getGame(game).versions.getCurrentVersion(region);
}

export function getVersionInfo(game: CanonicalGameId, region: Region, version: number): GameVersionInfo | null {
  return getGame(game).versions.getVersionInfo(region, version);
}

export function getAvailableVersions(game: CanonicalGameId, region: Region): GameVersionInfo[] {
  return getGame(game).versions.getAvailableVersions(region);
}

export function getVersionFromDate(game: CanonicalGameId, region: Region, date: Date, preferredVersion?: number): number {
  return versionAtDate(getAvailableVersions(game, region), date, region, preferredVersion);
}
