import "server-only";
import { resolveGame } from "@/lib/games/registry";
import { GameAdapterError, type CanonicalGameId, type GameRegionContext } from "@/lib/games/types";
import type { GameServerModule } from "./types";
import type { Region } from "@/lib/types";
import { maimaiServerModule } from "./maimai";
import { chunithmServerModule } from "./chunithm";

export const GAME_SERVER_MODULES = {
  maimai: maimaiServerModule,
  chunithm: chunithmServerModule,
} satisfies Record<CanonicalGameId, GameServerModule>;

export function resolveCatalogContext(input: string, region: Region): GameRegionContext {
  const registration = resolveGame(input);
  if (!registration.adapter.supportedRegions.has(region)) {
    throw new GameAdapterError("UNSUPPORTED_REGION", `${region} is not supported for ${registration.displayName}`, registration.id, region);
  }
  return { game: registration.id, region };
}
