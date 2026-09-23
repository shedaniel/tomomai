import "server-only";
import { GAME_REGISTRY, getEnabledRegions } from "./registry";
import type { FrontendGame } from "./frontend";
import type { CanonicalGameId } from "./types";

export function getFrontendGameDescriptor(game: CanonicalGameId): FrontendGame {
  const registration = GAME_REGISTRY[game];
  return {
    id: registration.id,
    displayName: registration.displayName,
    productName: registration.productName,
    enabled: registration.enabled,
    regions: getEnabledRegions(game),
    capabilities: [...registration.adapter.capabilities],
  };
}

export function getFrontendGame(): FrontendGame {
  return getFrontendGameDescriptor("maimai");
}
