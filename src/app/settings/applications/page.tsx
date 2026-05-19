import { ApplicationsSettings } from "@/components/settings/applications-settings";
import type { Metadata } from "next";

export const metadata: Metadata = { robots: { index: false } };

export default function ApplicationsPage() {
  return <ApplicationsSettings />;
}
