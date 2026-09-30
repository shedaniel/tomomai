import { getCurrentGame } from "@/lib/games/current";
import { getCatalogSection } from "@/lib/games/frontend";
import { createDbOGImage } from "@/lib/og";
import { ogImageVariants } from "@/lib/seo";
import type { Locale } from "@/i18n/locale";
import { getCatalogSectionCopy, getDatabaseCopy } from "../catalog-copy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ type: string }>;
};

export async function generateImageMetadata() {
  const { brand } = getCurrentGame();
  return ogImageVariants(`${brand.productName} database`);
}

export default async function Image({ params, id }: Props & { id: Promise<string> }) {
  const game = getCurrentGame();
  const [{ type }, locale] = await Promise.all([params, id]) as [{ type: string }, Locale];
  const section = getCatalogSection(game, type);
  if (!section) return new Response(null, { status: 404 });

  const copy = await getCatalogSectionCopy(section.id, locale, game) ?? await getDatabaseCopy(locale, game);
  return createDbOGImage({ brand: game.brand, tagline: copy.description, locale });
}
