import { getVersionInfo } from "@/lib/games/versions";
import type { CanonicalGameId } from "@/lib/games/types";
import type { Region } from "@/lib/types";

export function catalogPrefix(game: CanonicalGameId): string {
  return `api/v1/games/${game}`;
}

export function isCatalogVersion(game: CanonicalGameId, region: Region, gameVersion: number): boolean {
  return getVersionInfo(game, region, gameVersion) !== null;
}

export function songCatalogKey(game: CanonicalGameId, region: Region, gameVersion: number): string {
  return `${catalogPrefix(game)}/songs/${region}/${gameVersion}`;
}

export function catalogUrl(key: string): string {
  const base = process.env.NEXT_PUBLIC_R2_URL;
  if (!base) throw new Error("NEXT_PUBLIC_R2_URL is required for the song catalog redirect");
  return `${base.replace(/\/$/, "")}/${key}`;
}
