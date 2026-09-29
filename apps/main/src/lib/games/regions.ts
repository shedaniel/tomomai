import { REGIONS, type CanonicalGameId, type Region } from "./ids";
// registry.ts imports this module back, so getGame may only be called inside functions here.
import { getGame } from "./registry";

export function getSupportedRegions(game: CanonicalGameId): Region[] {
  const { sites } = getGame(game);
  return REGIONS.filter(region => sites[region] !== undefined);
}

export function getEnabledRegions(game: CanonicalGameId): Region[] {
  const variable = game === "maimai"
    ? (process.env.NEXT_PUBLIC_ENABLED_MAIMAI_REGIONS ?? process.env.NEXT_PUBLIC_ENABLED_REGIONS)
    : process.env.NEXT_PUBLIC_ENABLED_CHUNITHM_REGIONS;
  const supported = getSupportedRegions(game);
  if (variable === undefined) return (["intl", "jp"] as const).filter(region => supported.includes(region));

  return [...new Set(variable
    .split(",")
    .map(value => value.trim())
    .filter((value): value is Region => supported.some(region => region === value)))];
}
