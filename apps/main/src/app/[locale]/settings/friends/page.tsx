import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { FriendsSettings } from "@/components/settings/friends-settings";
import { getCurrentGame } from "@/lib/games/current";
import { supportsGameFeature } from "@/lib/games/frontend";
import { useFlags } from "@/lib/flags";

export const metadata: Metadata = { robots: { index: false } };

export default async function FriendsSettingsPage() {
  const flags = await useFlags();
  if (!flags.friends || !supportsGameFeature(getCurrentGame(), "friends")) notFound();
  return <FriendsSettings />;
}
