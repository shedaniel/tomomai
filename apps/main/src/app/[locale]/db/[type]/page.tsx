import { getCurrentGame } from "@/lib/games/current";
import { brandTitle, getCatalogSection } from "@/lib/games/frontend";
import { InlineNotFound } from "@/components/inline-not-found";
import { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getLocale } from "@/i18n/locale-server";
import { buildAlternates, openGraphLocales, ogImageUrl, localizePath } from "@/lib/seo";
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
  if (!section) return { robots: { index: false, follow: false } };
  const locale = await getLocale();
  const gameName = game.brand.displayName;

  let copy: { title: string; description: string } | null = null;
  if (section.id === "songs") {
    const t = await getTranslations("db.songs.metadata");
    copy = { title: t("title", { game: gameName }), description: t("description", { game: gameName }) };
  } else if (section.id === "stats") {
    const t = await getTranslations("db.stats");
    copy = { title: t("title"), description: t("description", { game: gameName }) };
  } else if (section.id === "events") {
    const t = await getTranslations("db.events");
    copy = { title: t("title"), description: t("description", { game: gameName }) };
  }
  if (!copy) return {};

  const path = `/db/${type}`;
  return {
    title: copy.title,
    description: copy.description,
    alternates: await buildAlternates(path),
    openGraph: {
      title: copy.title,
      description: copy.description,
      url: localizePath(path, locale),
      siteName: brandTitle(game.brand),
      type: "website",
      ...(game.id === "maimai" ? { images: [{ url: ogImageUrl(path, locale) }] } : {}),
      ...openGraphLocales(locale),
    },
    twitter: {
      card: "summary_large_image",
      title: copy.title,
      description: copy.description,
    },
  };
}

export default async function DbTypePage({ params }: DbTypePageProps) {
  const { type } = await params;
  const game = getCurrentGame();
  const section = getCatalogSection(game, type);
  const view = section && CATALOG_SECTION_VIEWS[section.id];
  if (!view) return <InlineNotFound kind="page" />;
  return view(game);
}
