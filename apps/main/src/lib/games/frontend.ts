import { offersCapability } from "./capabilities";
import type { Region } from "./ids";
import type { GameBrand, GameCapability, GameDefinition } from "./types";

export type FrontendGame = Pick<GameDefinition, "id" | "brand" | "loginMethods"> & {
  /** Only the catalog while no region is enabled, like the server's game resolver. */
  capabilities: readonly GameCapability[];
  regionCapabilityOverrides: NonNullable<GameDefinition["regionCapabilityOverrides"]>;
  regions: readonly Region[];
};

export function toFrontendGame(game: GameDefinition, regions: readonly Region[]): FrontendGame {
  if (!offersCapability(game, "catalog")) throw new Error(`${game.brand.displayName} cannot be served without its catalog`);
  return {
    id: game.id,
    brand: game.brand,
    capabilities: regions.length > 0 ? game.capabilities : ["catalog"],
    regionCapabilityOverrides: game.regionCapabilityOverrides ?? {},
    loginMethods: game.loginMethods,
    regions,
  };
}

export function brandTitle(brand: GameBrand): string {
  return `${brand.productName} ${brand.japaneseName}`;
}

/** Whether the served game offers the feature, and in the region when one is given. A region the game does not enable offers nothing. */
export function supportsGameFeature(game: FrontendGame, capability: GameCapability, region?: Region | null): boolean {
  if (region == null) return offersCapability(game, capability);
  return isGameRegion(game, region) && offersCapability(game, capability, region);
}

export function getGameRegion(game: FrontendGame, preferred?: string | null): Region | null {
  return game.regions.find(region => region === preferred) ?? game.regions[0] ?? null;
}

export function isGameRegion(game: FrontendGame, region: string): region is Region {
  return game.regions.some(candidate => candidate === region);
}

// The China deployment enables its game only in CN, which pins the locale and every region choice.
export function isGameCnExclusive(game: Pick<FrontendGame, "regions">): boolean {
  return game.regions.length === 1 && game.regions[0] === "cn";
}
