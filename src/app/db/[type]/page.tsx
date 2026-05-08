import { getAllUniqueSongsCached } from "@/server/queries/songs-cache";
import { Metadata } from "next";
import dynamic from "next/dynamic";
import { getTranslations } from "next-intl/server";
import { getLocale } from "@/i18n/locale-server";
import { buildAlternates, openGraphLocales } from "@/lib/seo";

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
  const locale = await getLocale();

  type Section = { title: string; description: string };
  let section: Section | null = null;
  if (type === "songs") {
    const t = await getTranslations("db.songs.metadata");
    section = { title: t("title"), description: t("description") };
  } else if (type === "stats") {
    const t = await getTranslations("db.stats");
    section = { title: t("title"), description: t("description") };
  } else if (type === "events") {
    const t = await getTranslations("db.events");
    section = { title: t("title"), description: t("description") };
  }
  if (!section) return {};

  const path = `/db/${type}`;
  return {
    title: section.title,
    description: section.description,
    alternates: buildAlternates(path),
    openGraph: {
      title: section.title,
      description: section.description,
      url: path,
      siteName: "tomomai ともマイ",
      type: "website",
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

  if (type === "songs") {
    // The list itself is mounted by /db/[type]/layout.tsx so it persists
    // across /db/songs ↔ /db/songs/[slug] navigation. This page just emits
    // page-level structured data.
    const songs = await getAllUniqueSongsCached();
    const t = await getTranslations("db.songs.metadata");

    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: t("title"),
      description: t("description"),
      numberOfItems: songs.length,
      itemListElement: songs.slice(0, 200).map((song, index) => ({
        "@type": "ListItem",
        position: index + 1,
        item: {
          "@type": "MusicRecording",
          name: song.songName,
          byArtist: {
            "@type": "MusicGroup",
            name: song.artist,
          },
          genre: song.genre,
        },
      })),
    };

    return (
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    );
  }

  if (type === "stats") {
    return <StatsDatabase />;
  }

  if (type === "events") {
    return <EventsDatabase />;
  }

  return (
    <>
      {type === "arcades" && (
        <div className="mt-4">
          <ArcadesMap />
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
