import type { CanonicalGameId, Region } from "./ids";
import { getGame } from "./registry";
import type { RegionalVersion, VersionRow } from "./version-table";

export function getVersion(game: CanonicalGameId, id: number): VersionRow | null {
  return getGame(game).versions.get(id);
}

export function getVersionInfo(game: CanonicalGameId, region: Region, id: number): RegionalVersion | null {
  return getGame(game).versions.regional(region, id);
}

export function getAvailableVersions(game: CanonicalGameId, region: Region): RegionalVersion[] {
  return getGame(game).versions.available(region);
}

export function getCurrentVersion(game: CanonicalGameId, region: Region): number {
  return getGame(game).versions.current(region);
}

export function getVersionFromDate(game: CanonicalGameId, region: Region, date: Date, preferredVersion?: number): number {
  return getGame(game).versions.atDate(region, date, preferredVersion);
}
