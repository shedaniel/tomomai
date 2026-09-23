import { GAME_REGISTRY, resolveGame, resolveGameContext, requireCapability } from "@/lib/games/registry";
import { GameAdapterError, type CanonicalGameId, type GameCapability } from "@/lib/games/types";
import type { Region } from "@/lib/types";

export function requireMaimaiQuery(game: CanonicalGameId, region?: Region, capability?: GameCapability): void {
  const registration = resolveGame(game);
  if (region) resolveGameContext(game, region, capability);
  else {
    if (!registration.enabled) throw new GameAdapterError("GAME_NOT_ENABLED", `${registration.displayName} is not enabled`, game);
    if (capability) requireCapability(game, capability);
  }
  if (game !== "maimai") {
    throw new GameAdapterError("UNSUPPORTED_CAPABILITY", `${GAME_REGISTRY[game].displayName} does not support this maimai view`, game, region, capability);
  }
}
