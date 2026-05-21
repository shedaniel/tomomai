import { renderOgImage, OG_DIMENSIONS } from "@/lib/og-image";

export const runtime = "nodejs";
export const revalidate = 3600;
export const size = OG_DIMENSIONS;
export const contentType = "image/png";
export const alt = "tomomai · Guess The Song";

export default async function Image() {
  return renderOgImage();
}
