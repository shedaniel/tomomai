import { chunithmDefinition } from "./chunithm/definition";
import type { CanonicalGameId, Region } from "./ids";
import { maimaiDefinition } from "./maimai/definition";
import { getEnabledRegions } from "./regions";
import { GameAdapterError, type GameCapability, type GameDefinition, type GameRegionContext } from "./types";

const GAMES = {
  maimai: maimaiDefinition,
  chunithm: chunithmDefinition,
} as const satisfies { [G in CanonicalGameId]: GameDefinition & { id: G } };

export type GameSiteRegion<G extends CanonicalGameId> = Extract<keyof (typeof GAMES)[G]["sites"], Region>;

export function getGame(id: CanonicalGameId): GameDefinition {
  return GAMES[id];
}

export function resolveGameContext(game: CanonicalGameId, region: Region, capability: GameCapability): GameRegionContext {
  requireCapability(game, capability, region);
  if (!getEnabledRegions(game).includes(region)) {
    throw new GameAdapterError("UNSUPPORTED_REGION", `${region} is not enabled for ${getGame(game).brand.displayName}`, game, region);
  }
  return { game, region };
}

// A game with no enabled regions is disabled, but its catalog stays readable.
export function requireCapability(game: CanonicalGameId, capability: GameCapability, region?: Region): void {
  const { brand, capabilities } = getGame(game);
  if (capability !== "catalog" && getEnabledRegions(game).length === 0) {
    throw new GameAdapterError("GAME_NOT_ENABLED", `${brand.displayName} is not enabled`, game, region, capability);
  }
  if (!capabilities.includes(capability)) {
    throw new GameAdapterError("UNSUPPORTED_CAPABILITY", `${brand.displayName} does not support ${capability}`, game, region, capability);
  }
}
