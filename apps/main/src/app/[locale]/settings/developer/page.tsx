import { DeveloperPortal } from "@/components/developer/developer-portal";
import { routesByScope } from "@/lib/api/specs";
import type { Metadata } from "next";

export const metadata: Metadata = { robots: { index: false } };

export default function DeveloperPage() {
  return <DeveloperPortal scopeRoutes={routesByScope()} />;
}
