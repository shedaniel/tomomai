import { resolveEnabledRegions } from "@tomomai/utils/regions";
import { logger } from "@/lib/logger";
import { REGIONS, type CanonicalGameId, type Region } from "./ids";
// registry.ts imports this module back, so getGame may only be called inside functions here.
import { getGame } from "./registry";

// Literal process.env reads let Next inline each variable into client bundles. A blank legacy
// variable counts as unset, as it did before the per-game variables existed.
const ENABLED_REGIONS_ENV = {
  maimai: () => process.env.NEXT_PUBLIC_ENABLED_MAIMAI_REGIONS ?? (process.env.NEXT_PUBLIC_ENABLED_REGIONS || undefined),
  chunithm: () => process.env.NEXT_PUBLIC_ENABLED_CHUNITHM_REGIONS,
} satisfies Record<CanonicalGameId, () => string | undefined>;

const reportedInvalidGames = new Set<CanonicalGameId>();

export function getSupportedRegions(game: CanonicalGameId): Region[] {
  const { sites } = getGame(game);
  return REGIONS.filter(region => sites[region] !== undefined);
}

export function getEnabledRegions(game: CanonicalGameId): Region[] {
  const value = ENABLED_REGIONS_ENV[game]();
  const { regions, invalid } = resolveEnabledRegions(value, getSupportedRegions(game));
  if (invalid && !reportedInvalidGames.has(game)) {
    reportedInvalidGames.add(game);
    logger.error({ game, value }, "Enabled regions variable names no supported region, so the game is disabled");
  }
  return regions;
}
