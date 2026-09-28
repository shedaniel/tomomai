import "server-only";
import { resolveGame } from "@/lib/games/registry";
import { GameAdapterError, type CanonicalGameId, type GameRegionContext } from "@/lib/games/types";
import type { ConfiguredCatalogAdapter, ConfiguredScoreAdapter, GameServerModule } from "./types";
import type { Region } from "@/lib/types";
import { maimaiServerModule } from "./maimai";
import { chunithmServerModule } from "./chunithm";

export const GAME_SERVER_MODULES = {
  maimai: maimaiServerModule,
  chunithm: chunithmServerModule,
} satisfies Record<CanonicalGameId, GameServerModule>;

export function requireConfiguredSource(game: CanonicalGameId, source: "scores"): ConfiguredScoreAdapter;
export function requireConfiguredSource(game: CanonicalGameId, source: "catalog"): ConfiguredCatalogAdapter;
export function requireConfiguredSource(game: CanonicalGameId, source: "catalog" | "scores") {
  const adapter = GAME_SERVER_MODULES[game][source];
  if (!adapter.configured) {
    throw new GameAdapterError("SOURCE_NOT_CONFIGURED", adapter.notConfiguredReason, game, undefined, source);
  }
  return adapter;
}

export function resolveCatalogContext(input: string, region: Region): GameRegionContext {
  const registration = resolveGame(input);
  if (!registration.adapter.supportedRegions.has(region)) {
    throw new GameAdapterError("UNSUPPORTED_REGION", `${region} is not supported for ${registration.displayName}`, registration.id, region);
  }
  requireConfiguredSource(registration.id, "catalog");
  return { game: registration.id, region };
}
