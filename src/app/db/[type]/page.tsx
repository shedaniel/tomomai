import { ArcadesMap } from "@/components/db/arcades";
import { EventsDatabase } from "@/components/db/events-database";
import { SongsDatabase } from "@/components/db/songs-database";
import { StatsDatabase } from "@/components/db/stats-database";
import { createServerSideTRPC } from "@/lib/trpc-server";
import { Metadata } from "next";
import { getTranslations } from "next-intl/server";

type DbTypePageProps = {
  params: Promise<{
    type: string;
  }>;
};

export async function generateMetadata({ params }: DbTypePageProps): Promise<Metadata> {
  const { type } = await params;

  if (type === "songs") {
    const t = await getTranslations("db.songs.metadata");
    return {
      title: t("title"),
      description: t("description"),
      openGraph: {
        title: t("title"),
        description: t("description"),
      },
    };
  }

  if (type === "stats") {
    const t = await getTranslations("db.stats");
    return {
      title: t("title"),
      description: t("title"),
      openGraph: {
        title: t("title"),
        description: t("title"),
      },
    };
  }

  if (type === "events") {
    const t = await getTranslations("db.events");
    return {
      title: t("title"),
      description: t("description"),
      openGraph: {
        title: t("title"),
        description: t("description"),
      },
    };
  }

  return {};
}

export default async function DbTypePage({ params }: DbTypePageProps) {
  const { type } = await params;

  if (type === "songs") {
    const trpc = await createServerSideTRPC();
    const songs = await trpc.user.getAllUniqueSongs();
    const t = await getTranslations("db.songs.metadata");

    // JSON-LD structured data for SEO
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
      <>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <SongsDatabase selectedSlug={null} initialSongs={songs} currentSong={null} />
      </>
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

      {/* Songs is handled by the if block above */}
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
