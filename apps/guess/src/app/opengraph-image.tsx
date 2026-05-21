import { renderOgImage, OG_DIMENSIONS } from "@/lib/og-image";
import { isHeardle } from "@/lib/heardle-config";

export const runtime = "nodejs";
export const revalidate = 3600;
export const size = OG_DIMENSIONS;
export const contentType = "image/png";
export const alt = isHeardle()
  ? "tomomai · Heardle"
  : "tomomai · Guess The Song";

export default async function Image() {
  return renderOgImage();
}
