import { InlineNotFound } from "@/components/inline-not-found";
import { getAllUniqueSongsCached } from "@/server/queries/songs-cache";
import { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getLocale } from "@/i18n/locale-server";
import { breadcrumbJsonLd, openGraphLocales, ogImageUrl, localizePath } from "@/lib/seo";
import { resolveBaseUrl } from "@/lib/base-url";
import { safeDecodeURIComponent } from "@/lib/utils";

// On-demand ISR. Catalog edits are pushed live by /api/admin/upload via
// revalidatePath per affected slug; 30d is the fallback freshness window.
export const revalidate = 2592000;

export async function headers() {
  return {
    "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
  };
}

export function generateStaticParams() {
  return [];
}

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

  const decodedSlug = safeDecodeURIComponent(slug);
  const songs = await getAllUniqueSongsCached();
  const song = songs.find(s => s.slug === decodedSlug);
  const path = `/db/songs/${encodeURIComponent(decodedSlug)}`;

  // Resolve locale/translations only when the song exists. For unknown slugs
  // bail with minimal metadata — this also keeps the invalid-slug path off
  // the locale-resolution code that would otherwise read headers.
  if (!song) {
    return {
      title: "Song not found | tomomai ともマイ",
      robots: { index: false, follow: false },
      alternates: {},
    };
  }

  const [t, locale] = await Promise.all([
    getTranslations("db.songs.metadata"),
    getLocale(),
  ]);

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
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description: ogDescription,
      url: localizePath(path, locale),
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

export default async function DbSlugPage({ params }: DbSlugPageProps) {
  const { type, slug } = await params;

  // Non-songs types have no detail page — render the inline not-found UI
  // (see note on InlineNotFound below).
  // The song-detail content is rendered by the @detail parallel slot at
  // /db/@detail/[type]/[slug]. This page renders the songs list (hydrated
  // client-side behind the drawer — no `initialSongs` prop, so the catalog
  // isn't serialized into the ISR payload) plus per-song JSON-LD.

  const decodedSlug = safeDecodeURIComponent(slug);
  const songs = await getAllUniqueSongsCached();
  const song = type === "songs" ? songs.find(s => s.slug === decodedSlug) : undefined;

  // Unknown slug: render a minimal, ISR-cacheable not-found UI inline.
  // We deliberately avoid next/navigation's notFound() here — in this
  // next-intl + on-demand-ISR setup it forces the route dynamic (reads
  // headers during the not-found boundary render) and returns a 500. The
  // inline UI keeps the route static/cheap; `robots: noindex` (set in
  // generateMetadata above) keeps these out of the index.
  if (!song) {
    return <InlineNotFound />;
  }

  const [tMeta, tNav] = await Promise.all([
    getTranslations("db.songs.metadata"),
    getTranslations("db.types"),
  ]);
  const baseUrl = resolveBaseUrl();
  const locale = await getLocale();

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
    url: `${baseUrl}${localizePath(`/db/songs/${encodeURIComponent(decodedSlug)}`, locale)}`,
    description: tMeta("jsonLdChartDescription", {
      chartType: song.type === "dx" ? tMeta("chartTypeDx") : tMeta("chartTypeStandard"),
    }),
  };

  const breadcrumb = breadcrumbJsonLd([
    { name: "tomomai", url: `${baseUrl}${localizePath("/", locale)}` },
    { name: tNav("songs"), url: `${baseUrl}${localizePath("/db/songs", locale)}` },
    { name: song.songName, url: `${baseUrl}${localizePath(`/db/songs/${encodeURIComponent(decodedSlug)}`, locale)}` },
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
