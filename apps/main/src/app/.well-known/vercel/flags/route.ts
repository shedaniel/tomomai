import { createFlagsDiscoveryEndpoint, getProviderData } from "flags/next";
import * as flagsModule from "@/lib/flags";

export const GET = createFlagsDiscoveryEndpoint(async () => {
  // The `useX` aliases exported from @/lib/flags are the SDK-wrapped flags;
  // filter the module exports down to those (they carry a `key` property).
  const exportedFlags = Object.fromEntries(
    Object.entries(flagsModule).filter(([, value]) => value && typeof value === "function" && "key" in (value as object)),
  );
  return getProviderData(exportedFlags as Parameters<typeof getProviderData>[0]);
});
