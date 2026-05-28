import { PrivacySettings } from "@/components/settings/privacy-settings";
import type { Metadata } from "next";

export const metadata: Metadata = { robots: { index: false } };

export default function PrivacySettingsPage() {
  return <PrivacySettings />;
}
