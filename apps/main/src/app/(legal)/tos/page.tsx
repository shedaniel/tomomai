import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLegalDocument } from "@/lib/legal";
import { LegalDocView } from "@/components/legal-doc-view";
import { getCurrentGame } from "@/lib/games/current";
import { brandTitle } from "@/lib/games/frontend";

export const metadata: Metadata = {
  title: `Terms of Service - ${brandTitle(getCurrentGame().brand)}`,
  description: `The Terms of Service governing the use of ${getCurrentGame().brand.productName}.`,
};

export default function TosPage() {
  const doc = getLegalDocument("tos");
  if (!doc) notFound();
  return <LegalDocView doc={doc} />;
}
