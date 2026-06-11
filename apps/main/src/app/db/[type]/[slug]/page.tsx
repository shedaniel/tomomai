import { getAllUniqueSongsCached } from "@/server/queries/songs-cache";
import { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getLocale } from "@/i18n/locale-server";
import { buildAlternates, breadcrumbJsonLd, openGraphLocales, ogImageUrl } from "@/lib/seo";
import { resolveBaseUrl } from "@tomomai/server/base-url";

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
  const [songs, t, locale] = await Promise.all([
    getAllUniqueSongsCached(),
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
        images: [{ url: ogImageUrl(path, locale) }],
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

  // The list is mounted by /db/[type]/layout.tsx; the song detail content
  // is rendered by the @detail parallel slot at /db/@detail/[type]/[slug].
  // This page just emits per-song JSON-LD.

  const decodedSlug = decodeURIComponent(slug);
  const songs = await getAllUniqueSongsCached();
  const song = songs.find(s => s.slug === decodedSlug);

  if (!song) {
    return null;
  }

  const [tMeta, tNav] = await Promise.all([
    getTranslations("db.songs.metadata"),
    getTranslations("db.types"),
  ]);
  const baseUrl = resolveBaseUrl();

  const songJsonLd = {
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
  };

  const breadcrumb = breadcrumbJsonLd([
    { name: "tomomai", url: `${baseUrl}/` },
    { name: tNav("songs"), url: `${baseUrl}/db/songs` },
    { name: song.songName, url: `${baseUrl}/db/songs/${encodeURIComponent(decodedSlug)}` },
  ]);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(songJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />
    </>
  );
}
