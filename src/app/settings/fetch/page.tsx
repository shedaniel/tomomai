import { FetchSettings } from "@/components/settings/fetch-settings";
import { applyFlagOverrides, useFlags } from "@/lib/flags";
import { cookies } from "next/headers";

export default async function FetchSettingsPage() {
  let flags = await useFlags();
  const cookieStore = await cookies();
  const flagOverridesCookie = cookieStore.get("flagOverrides")?.value;
  flags = applyFlagOverrides(flags, flagOverridesCookie);

  return <FetchSettings />;
}
