import { resolveEnabledRegions } from "@tomomai/utils/regions";
import { logger } from "@/lib/logger";
import { REGIONS, type CanonicalGameId, type Region } from "./ids";
import { getGame } from "./registry";

// Literal process.env reads let Next inline each variable into client bundles. A blank legacy
// variable counts as unset, as it did before the per-game variables existed.
const ENABLED_REGIONS_ENV = {
  maimai: () => process.env.NEXT_PUBLIC_ENABLED_MAIMAI_REGIONS ?? (process.env.NEXT_PUBLIC_ENABLED_REGIONS || undefined),
  chunithm: () => process.env.NEXT_PUBLIC_ENABLED_CHUNITHM_REGIONS,
} satisfies Record<CanonicalGameId, () => string | undefined>;

const reportedInvalidGames = new Set<CanonicalGameId>();

/** Among a chart's instances in one version, the region listed first supplies the chart's canonical attributes. */
const CANONICAL_REGION_PREFERENCE = ["jp", "intl", "cn"] as const satisfies readonly Region[];

/** Ranks a chart's instances: a later version wins, then the preferred region. */
export function instancePreference(instance: { region: Region; gameVersion: number }): number {
  return instance.gameVersion * 100 + CANONICAL_REGION_PREFERENCE.length - CANONICAL_REGION_PREFERENCE.indexOf(instance.region);
}

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
