import { isCatalogVersion } from "@/lib/api/catalog-location";
import type { VersionId } from "@/lib/metadata";
import type { CanonicalGameId } from "@/lib/games/types";
import type { Region } from "@/lib/types";

export function parseCatalogVersion(game: CanonicalGameId, region: Region, input: string): VersionId {
  const version = Number(input);
  if (!/^(?:0|-?[1-9]\d*)$/.test(input) || !isCatalogVersion(game, region, version)) {
    throw new Error(`Invalid catalog version for ${region}: ${input}`);
  }
  return version as VersionId;
}
