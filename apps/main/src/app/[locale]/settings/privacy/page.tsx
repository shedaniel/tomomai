import { PrivacySettings } from "@/components/settings/privacy-settings";
import type { Metadata } from "next";
import { getCurrentGame } from "@/lib/games/current";
import { supportsGameFeature } from "@/lib/games/frontend";
import { useFlags } from "@/lib/flags";

export const metadata: Metadata = { robots: { index: false } };

export default async function PrivacySettingsPage() {
  const flags = await useFlags();
  return <PrivacySettings friends={flags.friends && supportsGameFeature(getCurrentGame(), "friends")} />;
}
