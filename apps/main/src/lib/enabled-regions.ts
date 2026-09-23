import { getEnabledRegions as getGameEnabledRegions } from "./games/regions";
import type { Region } from "./types";

export function getEnabledMaimaiRegions(): Region[] {
  return getGameEnabledRegions("maimai");
}

export function isMaimaiRegionEnabled(region: Region): boolean {
  return getEnabledMaimaiRegions().includes(region);
}

export function isMaimaiRegionEnabledStr(region: string): region is Region {
  return getEnabledMaimaiRegions().includes(region as Region);
}

export function isMaimaiCNExclusive(): boolean {
  const regions = getEnabledMaimaiRegions();
  return regions.length === 1 && regions[0] === "cn";
}

// Existing maimai UI callers retain their region-only interface.
export const getEnabledRegions = getEnabledMaimaiRegions;
export const isRegionEnabled = isMaimaiRegionEnabled;
export const isRegionEnabledStr = isMaimaiRegionEnabledStr;
export const isCNExclusive = isMaimaiCNExclusive;
