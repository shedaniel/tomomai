import type { Region } from "./ids";
import type { GameBrand, GameCapability, GameDefinition } from "./types";

export type FrontendGame = Pick<GameDefinition, "id" | "brand" | "capabilities" | "fetch"> & {
  regions: readonly Region[];
};

export function toFrontendGame(game: GameDefinition, regions: readonly Region[]): FrontendGame {
  return { id: game.id, brand: game.brand, capabilities: game.capabilities, fetch: game.fetch, regions };
}

export function brandTitle(brand: GameBrand): string {
  return `${brand.productName} ${brand.japaneseName}`;
}

export function supportsGameFeature(game: FrontendGame, capability: GameCapability): boolean {
  return game.capabilities.includes(capability);
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
