import { GameAdapterError, type CanonicalGameId } from "@/lib/games/types";
import { getEnabledRegions, getSupportedRegions } from "@/lib/games/regions";
import { gameIdSchema } from "@/lib/games/schema";
import type { Region } from "@/lib/types";

export function resolveAdminGame(params: URLSearchParams): CanonicalGameId {
  const parsed = gameIdSchema.safeParse(params.get("game"));
  if (!parsed.success) throw new GameAdapterError("UNKNOWN_GAME", "Canonical game parameter is required");
  return parsed.data;
}

export function getDefaultAdminCatalogRegions(game: CanonicalGameId): Region[] {
  const enabled = getEnabledRegions(game);
  return enabled.length ? enabled : getSupportedRegions(game);
}
