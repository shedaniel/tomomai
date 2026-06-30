import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLegalDocument } from "@/lib/legal";
import { LegalDocView } from "@/components/legal-doc-view";

export const metadata: Metadata = {
  title: "Privacy Policy - tomomai ともマイ",
  description: "How tomomai handles your data.",
};

export default function PrivacyPage() {
  const doc = getLegalDocument("privacy");
  if (!doc) notFound();
  return <LegalDocView doc={doc} />;
}
