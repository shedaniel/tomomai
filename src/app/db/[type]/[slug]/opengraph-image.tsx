import { createSongOGImage, createHomeOGImage, DB_ACCENT, OG_SIZE } from "@/lib/og";
import { getAllUniqueSongsCached } from "@/server/queries/songs-cache";
import { getTranslations } from "next-intl/server";
import { createSafeMaimaiImageUrl, isR2Url } from "@/lib/utils";
import { resolveBaseUrlFromHeaders } from "@/lib/base-url";
import { headers } from "next/headers";
import { getVersionInfo } from "@/lib/metadata";
import type { Locale } from "@/i18n/locale";
import { getStaticOGImageLocales } from "@/i18n/og-locale";

export const runtime = "nodejs";
export const revalidate = 3600;

type Props = {
  params: Promise<{ type: string; slug: string }>;
};

export function generateImageMetadata() {
  return getStaticOGImageLocales().map(locale => ({ id: locale, alt: "maimai song", size: OG_SIZE, contentType: "image/png" as const }));
}

export default async function Image({ params, id }: Props & { id: Promise<string> }) {
  const [{ type, slug }, locale] = await Promise.all([params, id]) as [{ type: string; slug: string }, Locale];

  if (type !== "songs") {
    const t = await getTranslations({ locale, namespace: "db.songs.metadata" });
    return createHomeOGImage({
      tagline: t("description"),
      locale,
      logoFile: "icon-db-dark.webp",
      logoHeight: 220,
      accent: DB_ACCENT,
    });
  }

  const decodedSlug = decodeURIComponent(slug);
  const songs = await getAllUniqueSongsCached();
  const song = songs.find(s => s.slug === decodedSlug);

  if (!song) {
    const t = await getTranslations({ locale, namespace: "db.songs.metadata" });
    return createHomeOGImage({
      tagline: t("description"),
      locale,
      logoFile: "icon-db-dark.webp",
      logoHeight: 220,
      accent: DB_ACCENT,
    });
  }

  const baseUrl = resolveBaseUrlFromHeaders(await headers());
  const safeUrl = createSafeMaimaiImageUrl(song.cover);
  // sharp/node can fetch R2 directly; maimaidx URLs go through the local image-proxy route.
  const coverUrl = isR2Url(safeUrl)
    ? safeUrl
    : safeUrl.startsWith("/")
      ? `${baseUrl}${safeUrl}`
      : safeUrl;

  const versionName = getVersionInfo(song.addedVersion)?.shortName;

  return createSongOGImage({
    songName: song.songName,
    artist: song.artist,
    coverUrl,
    songType: song.type,
    genre: song.genre,
    versionName,
    difficulties: song.difficulties.map(d => ({
      difficulty: d.difficulty,
      levelPrecise: d.levelPrecise,
    })),
    locale,
  });
}
