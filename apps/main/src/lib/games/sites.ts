import type { CanonicalGameId, Region } from "./ids";
import { GameAdapterError } from "./errors";
import { getGame, type GameSiteRegion } from "./registry";
import type { GameSite } from "./types";

export function getGameSite(game: CanonicalGameId, region: Region): GameSite | undefined {
  return getGame(game).sites[region];
}

export function requireGameSite<G extends CanonicalGameId>(game: G, region: Region): asserts region is GameSiteRegion<G> {
  if (!getGameSite(game, region)) {
    throw new GameAdapterError("UNSUPPORTED_REGION", `${getGame(game).brand.displayName} has no ${region} site`, game, region);
  }
}

export function gameBaseUrl(game: CanonicalGameId, region: Region): string {
  const site = getGameSite(game, region);
  if (!site) throw new Error(`Unsupported game site: ${game}/${region}`);
  return new URL(site.entryUrl).origin;
}
