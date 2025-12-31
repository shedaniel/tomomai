import { createFlagsDiscoveryEndpoint, getProviderData } from "flags/next";
import * as flags from "../../../../lib/flags";

export const GET = createFlagsDiscoveryEndpoint(async () => {
  const flagDefinitions = Object.fromEntries(
    Object.entries(flags).filter(([, value]) => value && 'key' in value)
  ) as Record<string, any>;
  console.log(flagDefinitions);
  return getProviderData(flagDefinitions);
});
