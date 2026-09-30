import { getCurrentGame } from "@/lib/games/current";
import { getCatalogSection } from "@/lib/games/frontend";
import { InlineNotFound } from "@/components/inline-not-found";
import { Metadata } from "next";
import { getLocale } from "@/i18n/locale-server";
import { buildPageMetadata, MISSING_PAGE_METADATA } from "@/lib/seo";
import { getCatalogSectionCopy } from "../catalog-copy";
import { CATALOG_SECTION_VIEWS } from "./sections";

// On-demand ISR.
export const revalidate = 10800;

export async function headers() {
  return {
    "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
  };
}

export function generateStaticParams() {
  // Defer generation until the first request so builds do not query the database.
  return [];
}

type DbTypePageProps = {
  params: Promise<{
    type: string;
  }>;
};

export async function generateMetadata({ params }: DbTypePageProps): Promise<Metadata> {
  const { type } = await params;
  const game = getCurrentGame();
  const section = getCatalogSection(game, type);
  if (!section) return MISSING_PAGE_METADATA;
  const locale = await getLocale();
  const copy = await getCatalogSectionCopy(section.id, locale, game);
  if (!copy) return {};
  return buildPageMetadata({
    brand: game.brand,
    locale,
    path: `/db/${section.id}`,
    ...copy,
    ogType: "website",
    image: "route",
  });
}

export default async function DbTypePage({ params }: DbTypePageProps) {
  const { type } = await params;
  const game = getCurrentGame();
  const section = getCatalogSection(game, type);
  const view = section && CATALOG_SECTION_VIEWS[section.id];
  if (!view) return <InlineNotFound kind="page" />;
  return view(game);
}
