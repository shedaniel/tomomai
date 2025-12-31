import { SongsDatabase } from "@/components/db/songs-database";
import { createServerSideTRPC } from "@/lib/trpc-server";
import { Metadata } from "next";
import { getServerSession } from "@/lib/auth-server";
import { notFound } from "next/navigation";
import { createSafeMaimaiImageUrl } from "@/lib/utils";
import { resolveBaseUrl } from "@/lib/base-url";

type DbSlugPageProps = {
  params: Promise<{
    type: string;
    slug: string;
  }>;
};

export async function generateMetadata({ params }: DbSlugPageProps): Promise<Metadata> {
  const { type, slug } = await params;

  if (type !== "songs") {
    return {};
  }

  const decodedSlug = decodeURIComponent(slug);
  const trpc = await createServerSideTRPC();
  const songs = await trpc.user.getAllUniqueSongs();

  const song = songs.find(s => s.slug === decodedSlug);

  if (song) {
    const relativeUrl = createSafeMaimaiImageUrl(song.cover);
    const absoluteUrl = relativeUrl.startsWith("/")
      ? `${resolveBaseUrl()}${relativeUrl}`
      : relativeUrl;

    return {
      title: `${song.songName} - ${song.artist} | maimai DX`,
      description: `View detailed information about "${song.songName}" by ${song.artist}. ${song.type === 'dx' ? 'DX' : 'Standard'} chart • ${song.genre}`,
      openGraph: {
        title: `${song.songName} - ${song.artist} | maimai DX`,
        description: `View detailed information about "${song.songName}" by ${song.artist}.`,
        images: [absoluteUrl],
      },
    };
  }

  return {
    title: `Song Details | maimai DX`,
    description: `View detailed information about this maimai DX song including difficulty levels and regional availability.`,
  };
}

export default async function DbSlugPage({ params }: DbSlugPageProps) {
  const { type, slug } = await params;

  if (type !== "songs") {
    notFound();
  }

  const decodedSlug = decodeURIComponent(slug);
  const session = await getServerSession();
  const trpc = await createServerSideTRPC(session);
  const songs = await trpc.user.getAllUniqueSongs();

  const song = songs.find(s => s.slug === decodedSlug);

  // Fetch song details server-side if song exists
  let songDetails = null;
  if (song) {
    try {
      songDetails = await trpc.user.getSongDetails({ songName: song.songName, type: song.type });
    } catch {
      // Silently fail - will be fetched client-side
    }
  }

  // JSON-LD structured data for SEO
  const jsonLd = song ? {
    "@context": "https://schema.org",
    "@type": "MusicRecording",
    name: song.songName,
    byArtist: {
      "@type": "MusicGroup",
      name: song.artist,
    },
    genre: song.genre,
    description: `${song.type === 'dx' ? 'DX' : 'Standard'} chart from maimai DX`,
  } : null;

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <SongsDatabase selectedSlug={decodedSlug} initialSongs={null} currentSong={song ?? null} initialSongDetails={songDetails} />
    </>
  );
}
