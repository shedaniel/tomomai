import { getFrontendGame } from "@/lib/games/frontend-server";
import { supportsGameFeature } from "@/lib/games/frontend";
import { getGameCatalogSections } from "@/lib/games/presentation";
import { getGameBrand } from "@/lib/games/frontend";
import { InlineNotFound } from "@/components/inline-not-found";
import { getAllUniqueSongsCached } from "@/server/queries/songs-cache";
import { Metadata } from "next";
import dynamic from "next/dynamic";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { getLocale } from "@/i18n/locale-server";
import { buildAlternates, openGraphLocales, ogImageUrl, localizePath } from "@/lib/seo";

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

const ArcadesMap = dynamic(() => import("@/components/db/arcades").then(m => m.ArcadesMap));
const EventsDatabase = dynamic(() => import("@/components/db/events-database").then(m => m.EventsDatabase));
const StatsDatabase = dynamic(() => import("@/components/db/stats-database").then(m => m.StatsDatabase));

type DbTypePageProps = {
  params: Promise<{
    type: string;
  }>;
};

export async function generateMetadata({ params }: DbTypePageProps): Promise<Metadata> {
  const { type } = await params;
  const game = getFrontendGame();
  const locale = await getLocale();

  type Section = { title: string; description: string };
  let section: Section | null = null;
  if (type === "songs") {
    const t = await getTranslations("db.songs.metadata");
    section = { title: t("title", { game: getFrontendGame().displayName }), description: t("description", { game: getFrontendGame().displayName }) };
  } else if (type === "stats") {
    const t = await getTranslations("db.stats");
    section = { title: t("title", { game: getFrontendGame().displayName }), description: t("description", { game: getFrontendGame().displayName }) };
  } else if (type === "events") {
    const t = await getTranslations("db.events");
    section = { title: t("title", { game: getFrontendGame().displayName }), description: t("description", { game: getFrontendGame().displayName }) };
  }
  if (!section) return {};

  const path = `/db/${type}`;
  return {
    title: section.title,
    description: section.description,
    alternates: await buildAlternates(path),
    openGraph: {
      title: section.title,
      description: section.description,
      url: localizePath(path, locale),
      siteName: getGameBrand(game).title,
      type: "website",
      images: [{ url: ogImageUrl(path, locale) }],
      ...openGraphLocales(locale),
    },
    twitter: {
      card: "summary_large_image",
      title: section.title,
      description: section.description,
    },
  };
}

export default async function DbTypePage({ params }: DbTypePageProps) {
  const { type } = await params;
  const game = getFrontendGame();

  if (!game.enabled || !getGameCatalogSections(game.id).includes(type) || (type === "songs" && !supportsGameFeature(game, "catalog"))) return <InlineNotFound />;

  if (type === "songs") {
    // The interactive SongsList is mounted by /db/[type]/layout so it
    // persists across list ↔ detail navigation.
    const songs = await getAllUniqueSongsCached(game.id);
    const t = await getTranslations("db.songs.metadata");

    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: t("title", { game: getFrontendGame().displayName }),
      description: t("description", { game: getFrontendGame().displayName }),
      numberOfItems: songs.length,
    };

    return (
      <>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </>
    );
  }

  if (type === "stats") {
    return (<Suspense><StatsDatabase /></Suspense>);
  }

  if (type === "events") {
    return (<Suspense><EventsDatabase /></Suspense>);
  }

  return (
    <>
      {type === "arcades" && (
        <div className="mt-4">
          <Suspense><ArcadesMap /></Suspense>
        </div>
      )}

      {!["home", "arcades", "songs", "stats"].includes(type) && (
        <div className="mt-8">
          <div className="bg-muted/50 rounded-lg p-8 text-center">
            <p className="text-muted-foreground">
              Content for database type &quot;{type}&quot; coming soon...
            </p>
          </div>
        </div>
      )}
    </>
  );
}
