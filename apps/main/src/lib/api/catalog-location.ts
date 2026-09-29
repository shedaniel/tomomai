import { getRegionalVersion } from "@/lib/games/versions";
import type { CanonicalGameId } from "@/lib/games/types";
import type { Region } from "@/lib/types";

/** Bump when the published catalog JSON changes shape, so no CDN copy of the old shape is served under the new contract. */
const CATALOG_FORMAT_VERSION = 2;

function catalogPrefix(game: CanonicalGameId): string {
  return `catalog/v${CATALOG_FORMAT_VERSION}/${game}`;
}

export function isCatalogVersion(game: CanonicalGameId, region: Region, gameVersion: number): boolean {
  return getRegionalVersion(game, region, gameVersion) !== null;
}

export function parentCatalogKey(game: CanonicalGameId): string {
  return `${catalogPrefix(game)}/parents`;
}

export function songCatalogKey(game: CanonicalGameId, region: Region, gameVersion: number): string {
  return `${catalogPrefix(game)}/songs/${region}/${gameVersion}`;
}

export function catalogUrl(key: string): string {
  const base = process.env.NEXT_PUBLIC_R2_URL;
  if (!base) throw new Error("NEXT_PUBLIC_R2_URL is required for the song catalog redirect");
  return `${base.replace(/\/$/, "")}/${key}`;
}
