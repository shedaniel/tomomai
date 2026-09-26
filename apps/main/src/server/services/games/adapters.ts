import "server-only";
import { resolveGame } from "@/lib/games/registry";
import { GameAdapterError, type CanonicalGameId, type GameContext, type ConfiguredScoreAdapter, type ConfiguredCatalogAdapter, type CatalogSourceAdapter, type ScoreAdapter } from "@/lib/games/types";
import type { Region } from "@/lib/types";

export const GAME_SOURCES: Record<CanonicalGameId, { catalog: CatalogSourceAdapter; scores: ScoreAdapter }> = {
  maimai: {
    catalog: {
      configured: true,
      requiresToken: region => region !== "cn",
      async authenticate(region, token) {
        const { loginAndGetCookies } = await import("@/server/services/maimai-login");
        return loginAndGetCookies(region, token);
      },
      async collect(context) {
        const { collectCatalog } = await import("@/server/services/catalog/maimai/pipeline");
        return collectCatalog(context);
      },
    },
    scores: {
      configured: true,
      async validateToken(context) {
        const { maimaiScoreAdapter } = await import("@/lib/games/adapters/maimai/score");
        return maimaiScoreAdapter.validateToken?.(context);
      },
      async fetch(context) {
        const { maimaiScoreAdapter } = await import("@/lib/games/adapters/maimai/score");
        return maimaiScoreAdapter.fetch(context);
      },
    },
  },
  chunithm: {
    catalog: {
      configured: true,
      async collect(context) {
        const { collectCatalog } = await import("@/server/services/catalog/chunithm/pipeline");
        return collectCatalog(context);
      },
    },
    scores: {
      configured: false,
      notConfiguredReason: "CHUNITHM score fetching is not implemented; no upstream provider is configured.",
    },
  },
};

export function requireConfiguredSource(game: CanonicalGameId, source: "scores"): ConfiguredScoreAdapter;
export function requireConfiguredSource(game: CanonicalGameId, source: "catalog"): ConfiguredCatalogAdapter;
export function requireConfiguredSource(game: CanonicalGameId, source: "catalog" | "scores") {
  const adapter = GAME_SOURCES[game][source];
  if (!adapter.configured) {
    throw new GameAdapterError("SOURCE_NOT_CONFIGURED", adapter.notConfiguredReason, game, undefined, source);
  }
  return adapter;
}

export function resolveCatalogContext(input: string, region: Region): GameContext {
  const registration = resolveGame(input);
  if (!registration.adapter.supportedRegions.has(region)) {
    throw new GameAdapterError("UNSUPPORTED_REGION", `${region} is not supported for ${registration.displayName}`, registration.id, region);
  }
  requireConfiguredSource(registration.id, "catalog");
  return { game: registration.id, region };
}
