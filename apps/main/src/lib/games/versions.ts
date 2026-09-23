import type { Region } from "@/lib/types";
import type { CanonicalGameId, GameVersionInfo, VersionProvider } from "./types";
import { maimaiVersionProvider } from "./adapters/maimai/versions";
import { chunithmVersionProvider } from "./adapters/chunithm/versions";
import { versionAtDate } from "./version-time";

export { maimaiVersionProvider } from "./adapters/maimai/versions";
export { chunithmVersionProvider, ChunithmVersions, CHUNITHM_VERSIONS } from "./adapters/chunithm/versions";

const VERSION_PROVIDERS: Record<CanonicalGameId, VersionProvider> = {
  maimai: maimaiVersionProvider,
  chunithm: chunithmVersionProvider,
};

export function getCurrentVersion(game: CanonicalGameId, region: Region): number {
  return VERSION_PROVIDERS[game].getCurrentVersion(region);
}

export function getVersionInfo(game: CanonicalGameId, region: Region, version: number): GameVersionInfo | null {
  return VERSION_PROVIDERS[game].getVersionInfo(region, version);
}

export function getAvailableVersions(game: CanonicalGameId, region: Region): GameVersionInfo[] {
  return VERSION_PROVIDERS[game].getAvailableVersions(region);
}

export function getVersionFromDate(game: CanonicalGameId, region: Region, date: Date): number {
  return versionAtDate(getAvailableVersions(game, region), date, region);
}

export function getVersionsSortedByDate(game: CanonicalGameId, region: Region, ascending = true): GameVersionInfo[] {
  return getAvailableVersions(game, region).sort((a, b) =>
    ascending ? a.releaseDate.localeCompare(b.releaseDate) : b.releaseDate.localeCompare(a.releaseDate));
}
