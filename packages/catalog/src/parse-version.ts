import { getAvailableVersions } from "./metadata";
import type { VersionId } from "./metadata";
import type { Region } from "./types";

export function parseCatalogVersion(region: Region, input: string): VersionId {
  const version = Number(input);
  if (!/^(?:0|-?[1-9]\d*)$/.test(input) || !getAvailableVersions(region).some(candidate => candidate.id === version)) {
    throw new Error(`Invalid catalog version for ${region}: ${input}`);
  }
  return version as VersionId;
}
