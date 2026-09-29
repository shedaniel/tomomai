// Plain JavaScript so Node scripts (apps/main/scripts/register-discord-commands.js) can load it without a build step.

/**
 * Resolves a NEXT_PUBLIC_ENABLED_<GAME>_REGIONS value against the regions a game supports.
 * Unset enables every supported region except CN, which stays opt-in. A value with no entries enables none.
 * Entries are trimmed, filtered to `supported` and deduplicated in their listed order.
 * `invalid` marks a value whose entries name no supported region.
 *
 * @template {string} R
 * @param {string | undefined} value
 * @param {readonly R[]} supported
 * @returns {{ regions: R[]; invalid: boolean }}
 */
export function resolveEnabledRegions(value, supported) {
  if (value === undefined) {
    return { regions: supported.filter(region => region !== "cn"), invalid: false };
  }
  const entries = value.split(",").map(entry => entry.trim()).filter(entry => entry !== "");
  /** @type {R[]} */
  const regions = [];
  for (const entry of entries) {
    const region = supported.find(candidate => candidate === entry);
    if (region !== undefined && !regions.includes(region)) regions.push(region);
  }
  return { regions, invalid: regions.length === 0 && entries.length > 0 };
}
