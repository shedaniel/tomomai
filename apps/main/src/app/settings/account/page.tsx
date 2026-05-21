import { AccountSettings } from "@/components/settings/account-settings";
import type { Metadata } from "next";

export const metadata: Metadata = { robots: { index: false } };

export default function AccountSettingsPage() {
  return <AccountSettings />;
}
