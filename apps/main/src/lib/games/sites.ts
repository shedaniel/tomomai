import type { CanonicalGameId, Region } from "./ids";
import { getGame } from "./registry";
import type { GameSite } from "./types";

export function getGameSite(game: CanonicalGameId, region: Region): GameSite | undefined {
  return getGame(game).sites[region];
}

export function gameBaseUrl(game: CanonicalGameId, region: Region): string {
  const site = getGameSite(game, region);
  if (!site) throw new Error(`Unsupported game site: ${game}/${region}`);
  return new URL(site.entryUrl).origin;
}
