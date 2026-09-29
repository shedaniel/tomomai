import "server-only";
import { getGame } from "@/lib/games/registry";
import { getSupportedRegions } from "@/lib/games/regions";
import { GameAdapterError, type CanonicalGameId, type GameRegionContext } from "@/lib/games/types";
import type { GameServerModule } from "./types";
import type { Region } from "@/lib/types";
import { maimaiServerModule } from "./maimai";
import { chunithmServerModule } from "./chunithm";

export const GAME_SERVER_MODULES = {
  maimai: maimaiServerModule,
  chunithm: chunithmServerModule,
} satisfies Record<CanonicalGameId, GameServerModule>;

export function resolveCatalogContext(game: CanonicalGameId, region: Region): GameRegionContext {
  if (!getSupportedRegions(game).includes(region)) {
    throw new GameAdapterError("UNSUPPORTED_REGION", `${region} is not supported for ${getGame(game).brand.displayName}`, game, region);
  }
  return { game, region };
}
