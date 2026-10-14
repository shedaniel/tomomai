import dynamic from "next/dynamic";
import { Suspense, type ReactNode } from "react";
import { getLocale } from "@/i18n/locale-server";
import type { FrontendGame } from "@/lib/games/frontend";
import type { CatalogSectionId } from "@/lib/games/types";
import { getAllUniqueSongsCached } from "@/server/queries/songs-cache";
import { getDatabaseCopy } from "../catalog-copy";

const StatsDatabase = dynamic(() => import("@/components/games/maimai/db/stats-database").then(m => m.StatsDatabase));
const EventsDatabase = dynamic(() => import("@/components/games/maimai/db/events-database").then(m => m.EventsDatabase));
const ArcadesMap = dynamic(() => import("@/components/games/maimai/db/arcades").then(m => m.ArcadesMap));

type SectionView = (game: FrontendGame) => ReactNode | Promise<ReactNode>;

// The interactive SongsList is mounted by /db/[type]/layout so it persists across list and detail navigation.
const songs: SectionView = async game => {
  const [catalog, copy] = await Promise.all([getAllUniqueSongsCached(game.id), getLocale().then(locale => getDatabaseCopy(locale, game))]);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: copy.title,
    description: copy.description,
    numberOfItems: catalog.length,
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />;
};

/** What /db/[type] renders for each section the served game offers. */
export const CATALOG_SECTION_VIEWS: Record<CatalogSectionId, SectionView | null> = {
  songs,
  stats: () => <Suspense><StatsDatabase /></Suspense>,
  events: () => <Suspense><EventsDatabase /></Suspense>,
  arcades: () => <div className="mt-4"><Suspense><ArcadesMap /></Suspense></div>,
  // The static /db/posts route takes precedence over [type].
  posts: null,
};
