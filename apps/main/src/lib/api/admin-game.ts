import { GameAdapterError, type CanonicalGameId } from "@/lib/games/types";
import { resolveGame, resolveCatalogContext, requireConfiguredSource, getEnabledRegions } from "@/lib/games/registry";
import { gameIdSchema } from "@/lib/games/schema";
import type { Region } from "@/lib/types";

export function getAdminCatalogRegions(game: CanonicalGameId): Region[] {
  return [...resolveGame(game).adapter.supportedRegions];
}

export function resolveAdminGame(params: URLSearchParams): CanonicalGameId {
  const parsed = gameIdSchema.safeParse(params.get("game"));
  if (!parsed.success) throw new GameAdapterError("UNKNOWN_GAME", "Canonical game parameter is required");
  const game = parsed.data;
  requireConfiguredSource(game, "catalog");
  const region = params.get("region");
  if (region !== null) resolveCatalogContext(game, region as Region);
  return game;
}

export function getDefaultAdminCatalogRegions(game: CanonicalGameId): Region[] {
  const enabled = getEnabledRegions(game);
  return enabled.length ? enabled : getAdminCatalogRegions(game);
}
