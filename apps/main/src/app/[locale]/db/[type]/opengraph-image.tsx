import { getCurrentGame } from "@/lib/games/current";
import { getCatalogSection } from "@/lib/games/frontend";
import { createDbOGImage, OG_SIZE } from "@/lib/og";
import type { Locale } from "@/i18n/locale";
import { getOGImageLocales } from "@/i18n/og-locale";
import { getCatalogSectionCopy, getDatabaseCopy } from "../catalog-copy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ type: string }>;
};

export async function generateImageMetadata() {
  const { brand } = getCurrentGame();
  const locales = await getOGImageLocales();
  return locales.map(locale => ({ id: locale, alt: `${brand.productName} database`, size: OG_SIZE, contentType: "image/png" as const }));
}

export default async function Image({ params, id }: Props & { id: Promise<string> }) {
  const game = getCurrentGame();
  const [{ type }, locale] = await Promise.all([params, id]) as [{ type: string }, Locale];
  const section = getCatalogSection(game, type);
  if (!section) return new Response(null, { status: 404 });

  const copy = await getCatalogSectionCopy(section.id, locale, game) ?? await getDatabaseCopy(locale, game);
  return createDbOGImage({ brand: game.brand, tagline: copy.description, locale });
}
