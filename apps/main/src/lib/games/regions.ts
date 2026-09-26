import type { Region } from "@/lib/types";
import type { CanonicalGameId } from "./types";

export const GAME_SUPPORTED_REGIONS: Record<CanonicalGameId, ReadonlySet<Region>> = {
  maimai: new Set(["intl", "jp", "cn"]),
  chunithm: new Set(["intl", "jp"]),
};

export function getEnabledRegions(game: CanonicalGameId): Region[] {
  const variable = game === "maimai"
    ? (process.env.NEXT_PUBLIC_ENABLED_MAIMAI_REGIONS ?? process.env.NEXT_PUBLIC_ENABLED_REGIONS)
    : process.env.NEXT_PUBLIC_ENABLED_CHUNITHM_REGIONS;
  if (variable === undefined) return (["intl", "jp"] as const).filter(region => GAME_SUPPORTED_REGIONS[game].has(region));

  return [...new Set(variable
    .split(",")
    .map(value => value.trim())
    .filter((value): value is Region => GAME_SUPPORTED_REGIONS[game].has(value as Region)))];
}
