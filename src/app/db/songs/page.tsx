import { SongsDatabase } from "@/components/db/songs-database";
import { createServerSideTRPC } from "@/lib/trpc-server";
import { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
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

export default async function SongsPage() {
  const trpc = await createServerSideTRPC();
  const { songs } = await trpc.user.getAllUniqueSongs();
  const t = await getTranslations("db.songs.metadata");

  // JSON-LD structured data for SEO
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: t("title"),
    description: t("description"),
    numberOfItems: songs.length,
    itemListElement: songs.slice(0, 100).map((song, index) => ({
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
      <SongsDatabase selectedSlug={null} initialSongs={songs} />
    </>
  );
}
