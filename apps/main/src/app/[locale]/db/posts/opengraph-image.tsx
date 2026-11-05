import { getCurrentGame } from "@/lib/games/current";
import { getCatalogSection } from "@/lib/games/frontend";
import { createOGImage } from "@/lib/og";
import { ogImageVariants } from "@/lib/seo";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/locale";

export const runtime = "nodejs";
export const revalidate = false;

export async function generateImageMetadata() {
  return ogImageVariants("Changelog");
}

export default async function Image({ id }: { id: Promise<string> }) {
  const game = getCurrentGame();
  if (!getCatalogSection(game, "posts")) return new Response(null, { status: 404 });
  const locale = (await id) as Locale;
  const t = await getTranslations({ locale, namespace: "db.posts.list" });

  return createOGImage({
    brand: game.brand,
    section: t("title"),
    title: t("title"),
    summary: t("description"),
    locale,
  });
}
