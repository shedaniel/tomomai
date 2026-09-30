import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLegalDocument } from "@/lib/legal";
import { LegalDocView } from "@/components/legal-doc-view";
import { getCurrentGame } from "@/lib/games/current";
import { brandTitle } from "@/lib/games/frontend";

const { brand } = getCurrentGame();

export const metadata: Metadata = {
  title: `Privacy Policy - ${brandTitle(brand)}`,
  description: `How ${brand.productName} handles your data.`,
};

export default function PrivacyPage() {
  const doc = getLegalDocument("privacy");
  if (!doc) notFound();
  return <LegalDocView doc={doc} />;
}
