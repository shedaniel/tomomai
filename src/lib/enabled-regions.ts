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

/**
 * Check if the current region is China.
 *
 * @returns True if the current region is China
 *
 * @example
 * ```ts
 * if (isChinaRegion()) {
 *   // Show China-specific content
 * }
 * ```
 */
export function isChinaRegion(): boolean {
  return getEnabledRegions().includes("cn");
}
