import { createOGImage, OG_SIZE } from "@/lib/og";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/locale";
import { getOGImageLocales } from "@/i18n/og-locale";

export const runtime = "nodejs";
export const revalidate = false;

export async function generateImageMetadata() {
  const locales = await getOGImageLocales();
  return locales.map(locale => ({ id: locale, alt: "Changelog", size: OG_SIZE, contentType: "image/png" as const }));
}

export default async function Image({ id }: { id: Promise<string> }) {
  const locale = (await id) as Locale;
  const t = await getTranslations({ locale, namespace: "db.posts.list" });

  return createOGImage({
    section: t("title"),
    title: t("title"),
    summary: t("description"),
    locale,
  });
}
