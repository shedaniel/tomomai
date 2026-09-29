// Plain JavaScript so Node scripts (apps/main/scripts/register-discord-commands.js) can load it without a build step.

// CN stays opt-in, so an unset value enables every other supported region.
export function resolveEnabledRegions(value, supported) {
  if (value === undefined) {
    return { regions: supported.filter(region => region !== "cn"), invalid: false };
  }
  const entries = value.split(",").map(entry => entry.trim()).filter(entry => entry !== "");
  const regions = [];
  for (const entry of entries) {
    const region = supported.find(candidate => candidate === entry);
    if (region !== undefined && !regions.includes(region)) regions.push(region);
  }
  return { regions, invalid: regions.length === 0 && entries.length > 0 };
}
