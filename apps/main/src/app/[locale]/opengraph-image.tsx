import { getCurrentGame } from "@/lib/games/current";
import { brandTitle } from "@/lib/games/frontend";
import { createHomeOGImage } from "@/lib/og";
import { ogImageVariants } from "@/lib/seo";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/locale";

export const runtime = "nodejs";
export const revalidate = false;

export async function generateImageMetadata() {
  const { brand } = getCurrentGame();
  return ogImageVariants(brandTitle(brand));
}

export default async function Image({ id }: { id: Promise<string> }) {
  const { brand } = getCurrentGame();
  const locale = (await id) as Locale;
  const t = await getTranslations({ locale, namespace: "dashboard" });
  return createHomeOGImage({ brand, tagline: t("description", { game: brand.displayName }), locale });
}
