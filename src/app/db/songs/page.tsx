import { SongsDatabase } from "@/components/db/songs-database";
import { createServerSideTRPC } from "@/lib/trpc-server";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Songs Database | maimai DX",
  description: "Browse and search all maimai DX songs. Filter by type, genre, and version. View song details, difficulty levels, and regional availability.",
  openGraph: {
    title: "Songs Database | maimai DX",
    description: "Browse and search all maimai DX songs. Filter by type, genre, and version.",
  },
};

export default async function SongsPage() {
  const trpc = await createServerSideTRPC();
  const { songs } = await trpc.user.getAllUniqueSongs();

  // JSON-LD structured data for SEO
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "maimai DX Songs Database",
    description: "Browse and search all maimai DX songs. Filter by type, genre, and version.",
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
