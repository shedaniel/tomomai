import { getCurrentGame } from "@/lib/games/current";
import { createSongOGImage, createHomeOGImage, DB_ACCENT, OG_SIZE } from "@/lib/og";
import { getAllUniqueSongsCached } from "@/server/queries/songs-cache";
import { getTranslations } from "next-intl/server";
import { isR2Url, resolveImageUrl } from "@/lib/images";
import { resolveBaseUrlFromHeaders } from "@/lib/base-url";
import { headers } from "next/headers";
import { getVersion } from "@/lib/games/versions";
import type { Locale } from "@/i18n/locale";
import { getOGImageLocales } from "@/i18n/og-locale";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ type: string; slug: string }>;
};

export async function generateImageMetadata() {
  const locales = await getOGImageLocales();
  return locales.map(locale => ({ id: locale, alt: `${getCurrentGame().brand.displayName} song`, size: OG_SIZE, contentType: "image/png" as const }));
}

export default async function Image({ params, id }: Props & { id: Promise<string> }) {
  const [{ type, slug }, locale] = await Promise.all([params, id]) as [{ type: string; slug: string }, Locale];

  const game = getCurrentGame();

  if (type !== "songs") {
    const t = await getTranslations({ locale, namespace: "db.songs.metadata" });
    return createHomeOGImage({
      brand: game.brand,
      tagline: t("description", { game: game.brand.displayName }),
      locale,
      artwork: "dbLogo",
      logoHeight: 220,
      accent: DB_ACCENT,
    });
  }

  const decodedSlug = decodeURIComponent(slug);
  const songs = await getAllUniqueSongsCached(game.id);
  const song = songs.find(s => s.slug === decodedSlug);

  if (!song) {
    const t = await getTranslations({ locale, namespace: "db.songs.metadata" });
    return createHomeOGImage({
      brand: game.brand,
      tagline: t("description", { game: game.brand.displayName }),
      locale,
      artwork: "dbLogo",
      logoHeight: 220,
      accent: DB_ACCENT,
    });
  }

  const baseUrl = resolveBaseUrlFromHeaders(await headers());
  const safeUrl = resolveImageUrl(song.cover);
  // sharp/node can fetch R2 directly; maimaidx URLs go through the local image-proxy route.
  const coverUrl = isR2Url(safeUrl)
    ? safeUrl
    : safeUrl.startsWith("/")
      ? `${baseUrl}${safeUrl}`
      : safeUrl;

  const versionName = getVersion(game.id, song.addedVersion)?.shortName;

  return createSongOGImage({
    game: game.id,
    brand: game.brand,
    songName: song.songName,
    artist: song.artist,
    coverUrl,
    songType: song.type,
    genre: song.genre,
    versionName,
    difficulties: song.difficulties.map(d => ({
      difficulty: d.difficulty,
      levelPrecise: d.levelPrecise,
      levelPreciseEstimated: d.levelPreciseEstimated,
    })),
    locale,
  });
}
