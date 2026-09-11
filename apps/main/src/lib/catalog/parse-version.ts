import { isCatalogVersion } from "@/lib/api/catalog-location";
import type { VersionId } from "@/lib/metadata";
import type { Region } from "@/lib/types";

export function parseCatalogVersion(region: Region, input: string): VersionId {
  const version = Number(input);
  if (!/^(?:0|-?[1-9]\d*)$/.test(input) || !isCatalogVersion(region, version)) {
    throw new Error(`Invalid catalog version for ${region}: ${input}`);
  }
  return version as VersionId;
}
