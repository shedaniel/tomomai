import type { Region } from "@/lib/types";
import type { CanonicalGameId, GameVersionInfo } from "./types";
import { GAME_REGISTRY } from "./registry";
import { versionAtDate } from "./version-time";

export { maimaiVersionProvider } from "./adapters/maimai/versions";
export { chunithmVersionProvider, ChunithmVersions, CHUNITHM_VERSIONS } from "./adapters/chunithm/versions";

export function getCurrentVersion(game: CanonicalGameId, region: Region): number {
  return GAME_REGISTRY[game].adapter.versions.getCurrentVersion(region);
}

export function getVersionInfo(game: CanonicalGameId, region: Region, version: number): GameVersionInfo | null {
  return GAME_REGISTRY[game].adapter.versions.getVersionInfo(region, version);
}

export function getAvailableVersions(game: CanonicalGameId, region: Region): GameVersionInfo[] {
  return GAME_REGISTRY[game].adapter.versions.getAvailableVersions(region);
}

export function getVersionFromDate(game: CanonicalGameId, region: Region, date: Date, preferredVersion?: number): number {
  return versionAtDate(getAvailableVersions(game, region), date, region, preferredVersion);
}

export function getVersionsSortedByDate(game: CanonicalGameId, region: Region, ascending = true): GameVersionInfo[] {
  return getAvailableVersions(game, region).sort((a, b) =>
    ascending ? a.releaseDate.localeCompare(b.releaseDate) : b.releaseDate.localeCompare(a.releaseDate));
}
