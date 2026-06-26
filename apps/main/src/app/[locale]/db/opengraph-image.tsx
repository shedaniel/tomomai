import { createHomeOGImage, DB_ACCENT, OG_SIZE } from "@/lib/og";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/locale";
import { getOGImageLocales } from "@/i18n/og-locale";

export const runtime = "nodejs";
export const revalidate = false;

export async function generateImageMetadata() {
  const locales = await getOGImageLocales();
  return locales.map(locale => ({ id: locale, alt: "tomomai database", size: OG_SIZE, contentType: "image/png" as const }));
}

export default async function Image({ id }: { id: Promise<string> }) {
  const locale = (await id) as Locale;
  const t = await getTranslations({ locale, namespace: "db.songs.metadata" });

  return createHomeOGImage({
    tagline: t("description"),
    locale,
    logoFile: "icon-db-dark.webp",
    logoHeight: 220,
    accent: DB_ACCENT,
  });
}
