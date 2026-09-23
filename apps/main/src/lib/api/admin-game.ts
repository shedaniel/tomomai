import { GameAdapterError, type CanonicalGameId } from "@/lib/games/types";
import { resolveGame, resolveGameContext, requireConfiguredSource } from "@/lib/games/registry";
import type { Region } from "@/lib/types";

export function resolveAdminGame(params: URLSearchParams): CanonicalGameId {
  const game = params.get("game");
  if (game !== "maimai" && game !== "chunithm") throw new GameAdapterError("UNKNOWN_GAME", "Canonical game parameter is required");
  if (!resolveGame(game).enabled) throw new GameAdapterError("GAME_NOT_ENABLED", "Game is not enabled", game);
  requireConfiguredSource(game, "catalog");
  const region = params.get("region");
  if (region !== null) resolveGameContext(game, region as Region, "catalog");
  return game;
}
