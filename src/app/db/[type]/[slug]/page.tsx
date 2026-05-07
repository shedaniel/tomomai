import { SongsDatabase } from "@/components/db/songs-database";
import { createServerSideTRPC } from "@/lib/trpc-server";
import { Metadata } from "next";
import { getServerSession } from "@/lib/auth-server";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getLocale } from "@/i18n/locale-server";
import { buildAlternates, breadcrumbJsonLd, openGraphLocales } from "@/lib/seo";
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
  const [songs, t, locale] = await Promise.all([
    trpc.user.getAllUniqueSongs(),
    getTranslations("db.songs.metadata"),
    getLocale(),
  ]);

  const song = songs.find(s => s.slug === decodedSlug);
  const path = `/db/songs/${encodeURIComponent(decodedSlug)}`;

  if (song) {
    const chartType = song.type === "dx" ? t("chartTypeDx") : t("chartTypeStandard");
    const title = t("songTitle", { songName: song.songName, artist: song.artist });
    const description = t("songDescription", {
      songName: song.songName,
      artist: song.artist,
      chartType,
      genre: song.genre,
    });
    const ogDescription = t("songOgDescription", {
      songName: song.songName,
      artist: song.artist,
    });

    // og:image is provided by the sibling opengraph-image.tsx file convention.
    return {
      title,
      description,
      alternates: buildAlternates(path),
      openGraph: {
        title,
        description: ogDescription,
        url: path,
        siteName: "tomomai ともマイ",
        type: "article",
        ...openGraphLocales(locale),
      },
      twitter: {
        card: "summary_large_image",
        title,
        description: ogDescription,
      },
    };
  }

  return {
    title: t("songFallbackTitle"),
    description: t("songFallbackDescription"),
    alternates: buildAlternates(path),
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

  const [tMeta, tNav] = await Promise.all([
    getTranslations("db.songs.metadata"),
    getTranslations("db.types"),
  ]);
  const baseUrl = resolveBaseUrl();

  // JSON-LD structured data for SEO
  const songJsonLd = song ? {
    "@context": "https://schema.org",
    "@type": "MusicRecording",
    name: song.songName,
    byArtist: {
      "@type": "MusicGroup",
      name: song.artist,
    },
    genre: song.genre,
    image: song.cover,
    url: `${baseUrl}/db/songs/${encodeURIComponent(decodedSlug)}`,
    description: tMeta("jsonLdChartDescription", {
      chartType: song.type === "dx" ? tMeta("chartTypeDx") : tMeta("chartTypeStandard"),
    }),
  } : null;

  const breadcrumb = song ? breadcrumbJsonLd([
    { name: "tomomai", url: `${baseUrl}/` },
    { name: tNav("songs"), url: `${baseUrl}/db/songs` },
    { name: song.songName, url: `${baseUrl}/db/songs/${encodeURIComponent(decodedSlug)}` },
  ]) : null;

  return (
    <>
      {songJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(songJsonLd) }}
        />
      )}
      {breadcrumb && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
        />
      )}
      <SongsDatabase selectedSlug={decodedSlug} initialSongs={null} currentSong={song ?? null} initialSongDetails={songDetails} />
    </>
  );
}
