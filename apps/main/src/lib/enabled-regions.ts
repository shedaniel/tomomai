import type { Region } from "./types";

/**
 * Get the list of enabled regions from the NEXT_PUBLIC_ENABLED_REGIONS environment variable.
 *
 * @returns Array of enabled regions
 * @default ["intl", "jp"]
 *
 * @example
 * ```ts
 * const regions = getEnabledRegions(); // ["intl", "jp"]
 * ```
 */
export function getEnabledRegions(): Region[] {
  const envValue = process.env.NEXT_PUBLIC_ENABLED_REGIONS;

  if (!envValue) {
    return ["intl", "jp"];
  }

  const regions = envValue
    .split(",")
    .map(r => r.trim())
    .filter(r => r === "intl" || r === "jp" || r === "cn") as Region[];

  // If no valid regions found, return default
  if (regions.length === 0) {
    return ["intl", "jp"];
  }

  return regions;
}

/**
 * Check if a specific region is enabled.
 *
 * @param region - The region to check
 * @returns True if the region is enabled
 *
 * @example
 * ```ts
 * if (isRegionEnabled("intl")) {
 *   // Show international content
 * }
 * ```
 */
export function isRegionEnabled(region: Region): boolean {
  return getEnabledRegions().includes(region);
}

export function isRegionEnabledStr(region: string): region is Region {
  return getEnabledRegions().includes(region as Region);
}

/**
 * Check if this build is the CN-exclusive deployment (only CN region enabled).
 *
 * Used to gate CN-deployment-specific UI (e.g. forced zh-CN locale, QQ auth,
 * Bilibili links, hidden locale switcher). On a multi-region build that
 * happens to include CN (e.g. intl,jp,cn on .lol), this returns false.
 *
 * @returns True iff CN is the only enabled region
 */
export function isCNExclusive(): boolean {
  const regions = getEnabledRegions();
  return regions.length === 1 && regions[0] === "cn";
}
