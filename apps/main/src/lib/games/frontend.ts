import type { Region } from "@/lib/types";
import type { CanonicalGameId, GameCapability } from "./types";

export interface FrontendGame {
  id: CanonicalGameId;
  displayName: string;
  productName: "tomomai" | "tomochu";
  enabled: boolean;
  fetchConfigured?: boolean;
  regions: readonly Region[];
  capabilities: readonly GameCapability[];
}

export function getGameBrand(game: Pick<FrontendGame, "id" | "productName">) {
  const japaneseName = game.id === "maimai" ? "ともマイ" : "ともチュウ";
  return { name: game.productName, japaneseName, title: [game.productName, japaneseName].filter(Boolean).join(" ") };
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
