import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLegalDocument } from "@/lib/legal";
import { LegalDocView } from "@/components/legal-doc-view";

export const metadata: Metadata = {
  title: "Terms of Service - tomomai ともマイ",
  description: "The Terms of Service governing the use of tomomai.",
};

export default function TosPage() {
  const doc = getLegalDocument("tos");
  if (!doc) notFound();
  return <LegalDocView doc={doc} />;
}
