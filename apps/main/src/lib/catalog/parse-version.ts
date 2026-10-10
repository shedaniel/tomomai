import { isCatalogVersion } from "@/lib/api/catalog-location";
import type { CanonicalGameId, Region } from "@/lib/games/ids";

export function parseCatalogVersion(game: CanonicalGameId, region: Region, input: string): number {
  const version = Number(input);
  if (!/^(?:0|-?[1-9]\d*)$/.test(input) || !isCatalogVersion(game, region, version)) {
    throw new Error(`Invalid catalog version for ${region}: ${input}`);
  }
  return version;
}
