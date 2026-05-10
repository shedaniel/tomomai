import { DeveloperPortal } from "@/components/developer/developer-portal";
import type { Metadata } from "next";

export const metadata: Metadata = { robots: { index: false } };

export default function DeveloperPage() {
  return <DeveloperPortal />;
}
