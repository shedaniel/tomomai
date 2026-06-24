import { AccountSettings } from "@/components/settings/account-settings";
import { useFlags } from "@/lib/flags";
import type { Metadata } from "next";

export const metadata: Metadata = { robots: { index: false } };

export default async function AccountSettingsPage() {
  const flags = await useFlags();
  return <AccountSettings flags={{ passkey: flags.passkey, twitterOauth: flags.twitterOauth }} />;
}
