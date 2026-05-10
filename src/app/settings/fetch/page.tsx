import { FetchSettings } from "@/components/settings/fetch-settings";
import type { Metadata } from "next";

export const metadata: Metadata = { robots: { index: false } };

export default async function FetchSettingsPage() {
  return <FetchSettings />;
}
