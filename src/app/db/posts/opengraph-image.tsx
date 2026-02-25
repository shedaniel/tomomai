import { createOGImage, OG_SIZE } from "@/lib/og";
import { getTranslations } from "next-intl/server";
import { getLocale } from "@/i18n/locale-server";

export const runtime = "nodejs";
export const alt = "Changelog";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image() {
  const [t, locale] = await Promise.all([
    getTranslations("db.posts.list"),
    getLocale(),
  ]);

  return createOGImage({
    section: t("title"),
    title: t("title"),
    summary: t("description"),
    locale,
  });
}
