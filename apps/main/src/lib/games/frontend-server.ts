import "server-only";
import { GAME_REGISTRY, getEnabledRegions } from "./registry";
import type { FrontendGame } from "./frontend";
import type { CanonicalGameId } from "./types";
import { resolveFrontendGame } from "./frontend-config";

export function getFrontendGameDescriptor(game: CanonicalGameId): FrontendGame {
  const registration = GAME_REGISTRY[game];
  const fetchConfigured = registration.adapter.capabilities.has("scores");
  return {
    id: registration.id,
    displayName: registration.displayName,
    productName: registration.productName,
    enabled: registration.enabled,
    fetchConfigured,
    cookieLoginConfigured: fetchConfigured && registration.adapter.fetch.cookieLogin !== null,
    regions: getEnabledRegions(game),
    capabilities: [...registration.adapter.capabilities],
  };
}

// Selects rendered pages only; admin/backend operations take explicit game on a shared instance.
export function getFrontendGame(): FrontendGame {
  return getFrontendGameDescriptor(resolveFrontendGame(process.env.FRONTEND_GAME));
}
