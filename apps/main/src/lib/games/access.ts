import { offersCapability } from "./capabilities";
import { GameAdapterError } from "./errors";
import type { CanonicalGameId, Region } from "./ids";
import { getEnabledRegions, getSupportedRegions } from "./regions";
import { getGame } from "./registry";
import type { GameCapability, GameRegionContext } from "./types";

/** Player requests accept the regions a deployment enables. Catalog administration accepts every region the game has a site for. */
export type RegionPolicy = "enabled" | "supported";

type GameAccess = {
  capability: GameCapability;
  regionPolicy?: RegionPolicy;
};

/**
 * The one check behind every game boundary: the game offers the capability, in the region when one is given.
 * A game with no enabled regions is disabled, but its catalog stays readable.
 */
export function resolveGameContext(game: CanonicalGameId, access: GameAccess & { region: Region }): GameRegionContext;
export function resolveGameContext(game: CanonicalGameId, access: GameAccess & { region?: Region }): { game: CanonicalGameId; region?: Region };
export function resolveGameContext(
  game: CanonicalGameId,
  { region, capability, regionPolicy = "enabled" }: GameAccess & { region?: Region },
): { game: CanonicalGameId; region?: Region } {
  const definition = getGame(game);
  const { brand } = definition;
  if (capability !== "catalog" && getEnabledRegions(game).length === 0) {
    throw new GameAdapterError("GAME_NOT_ENABLED", `${brand.displayName} is not enabled`, game, region, capability);
  }
  if (!offersCapability(definition, capability)) {
    throw new GameAdapterError("UNSUPPORTED_CAPABILITY", `${brand.displayName} does not support ${capability}`, game, region, capability);
  }
  if (region === undefined) return { game };

  const regions = regionPolicy === "enabled" ? getEnabledRegions(game) : getSupportedRegions(game);
  if (!regions.includes(region)) {
    throw new GameAdapterError("UNSUPPORTED_REGION", `${region} is not ${regionPolicy} for ${brand.displayName}`, game, region);
  }
  if (!offersCapability(definition, capability, region)) {
    throw new GameAdapterError("UNSUPPORTED_CAPABILITY", `${brand.displayName} does not support ${capability} in ${region}`, game, region, capability);
  }
  return { game, region };
}
