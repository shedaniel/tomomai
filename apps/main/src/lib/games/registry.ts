import type { Region } from "@/lib/types";
import { getEnabledRegions } from "./regions";
import { chunithmAdapter } from "./adapters/chunithm";
import { maimaiAdapter } from "./adapters/maimai";
import {
  CANONICAL_GAME_IDS,
  GameAdapterError,
  type CanonicalGameId,
  type GameAdapter,
  type GameCapability,
  type GameContext,
} from "./types";

export { getEnabledRegions } from "./regions";

type GameRegistration = {
  id: CanonicalGameId;
  displayName: string;
  productName: "tomomai" | "tomochu";
  enabled: boolean; // Player features may roll out after the catalog.
  adapter: GameAdapter;
};

export const GAME_REGISTRY: Record<CanonicalGameId, GameRegistration> = {
  maimai: {
    id: "maimai",
    displayName: "maimai DX",
    productName: "tomomai",
    enabled: true,
    adapter: maimaiAdapter,
  },
  chunithm: {
    id: "chunithm",
    displayName: "CHUNITHM",
    productName: "tomochu",
    enabled: true,
    adapter: chunithmAdapter,
  },
};

export function normalizeGameId(input: string): CanonicalGameId | null {
  if (input === "maimaidx") return "maimai";
  return CANONICAL_GAME_IDS.find(game => game === input) ?? null;
}

export function resolveGame(input: string): GameRegistration {
  const game = normalizeGameId(input);
  if (!game) throw new GameAdapterError("UNKNOWN_GAME", `Unknown game: ${input}`);
  return GAME_REGISTRY[game];
}

export function resolveGameContext(input: string, region: Region, capability?: GameCapability): GameContext {
  const registration = resolveGame(input);
  if (capability) requireCapability(registration.id, capability, region);
  else if (!registration.enabled) {
    throw new GameAdapterError("GAME_NOT_ENABLED", `${registration.displayName} is not enabled`, registration.id, region);
  }
  if (!registration.adapter.supportedRegions.has(region) || !getEnabledRegions(registration.id).includes(region)) {
    throw new GameAdapterError("UNSUPPORTED_REGION", `${region} is not enabled for ${registration.displayName}`, registration.id, region);
  }
  return { game: registration.id, region };
}

export function requireCapability(game: CanonicalGameId, capability: GameCapability, region?: Region): void {
  const registration = GAME_REGISTRY[game];
  if (capability !== "catalog" && !registration.enabled) {
    throw new GameAdapterError("GAME_NOT_ENABLED", `${registration.displayName} is not enabled`, game, region, capability);
  }
  if (!registration.adapter.capabilities.has(capability)) {
    throw new GameAdapterError("UNSUPPORTED_CAPABILITY", `${registration.displayName} does not support ${capability}`, game, region, capability);
  }
}
