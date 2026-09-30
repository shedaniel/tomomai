import { getCurrentGame } from "@/lib/games/current";
import { getCatalogSection } from "@/lib/games/frontend";
import { createHomeOGImage, DB_ACCENT, OG_SIZE } from "@/lib/og";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/locale";
import { getOGImageLocales } from "@/i18n/og-locale";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ type: string }>;
};

export async function generateImageMetadata() {
  const locales = await getOGImageLocales();
  return locales.map(locale => ({ id: locale, alt: `${getCurrentGame().brand.productName} database`, size: OG_SIZE, contentType: "image/png" as const }));
}

export default async function Image({ params, id }: Props & { id: Promise<string> }) {
  const game = getCurrentGame();
  // TODO: Add CHUNITHM section images without relying on maimai score-detail support.
  if (game.id !== "maimai") return new Response(null, { status: 404 });
  const [{ type }, locale] = await Promise.all([params, id]) as [{ type: string }, Locale];
  const section = getCatalogSection(game, type);
  if (!section) return new Response(null, { status: 404 });

  let tagline: string;
  if (section.id === "stats") {
    tagline = (await getTranslations({ locale, namespace: "db.stats" }))("description", { game: game.brand.displayName });
  } else if (section.id === "events") {
    tagline = (await getTranslations({ locale, namespace: "db.events" }))("description", { game: game.brand.displayName });
  } else {
    tagline = (await getTranslations({ locale, namespace: "db.songs.metadata" }))("description", { game: game.brand.displayName });
  }

  return createHomeOGImage({
    brand: game.brand,
    tagline,
    locale,
    artwork: "dbLogo",
    logoHeight: 220,
    accent: DB_ACCENT,
  });
}
