import { getCurrentGame } from "@/lib/games/current";
import { brandTitle } from "@/lib/games/frontend";
import { createHomeOGImage, OG_SIZE } from "@/lib/og";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/locale";
import { getOGImageLocales } from "@/i18n/og-locale";

export const runtime = "nodejs";
export const revalidate = false;

export async function generateImageMetadata() {
  const { brand } = getCurrentGame();
  const locales = await getOGImageLocales();
  return locales.map(locale => ({ id: locale, alt: brandTitle(brand), size: OG_SIZE, contentType: "image/png" as const }));
}

export default async function Image({ id }: { id: Promise<string> }) {
  const { brand } = getCurrentGame();
  const locale = (await id) as Locale;
  const t = await getTranslations({ locale, namespace: "dashboard" });
  return createHomeOGImage({ brand, tagline: t("description", { game: brand.displayName }), locale });
}
