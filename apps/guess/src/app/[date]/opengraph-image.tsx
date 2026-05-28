import { renderOgImage, OG_DIMENSIONS } from "@/lib/og-image";
import { parsePastDateSlug } from "@/lib/date-slug";
import { notFound } from "next/navigation";

export const runtime = "nodejs";
export const revalidate = 3600;
export const size = OG_DIMENSIONS;
export const contentType = "image/png";
export const alt = "tomomai · Guess The Song";

type Props = {
  params: Promise<{ date: string }>;
};

export default async function Image({ params }: Props) {
  const { date: slug } = await params;
  const dateKey = parsePastDateSlug(slug);
  if (!dateKey) notFound();
  return renderOgImage(dateKey);
}
