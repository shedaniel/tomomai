import { createSongOGImage, createHomeOGImage, DB_ACCENT, OG_SIZE } from "@/lib/og";
import { createServerSideTRPC } from "@/lib/trpc-server";
import { getLocale } from "@/i18n/locale-server";
import { getTranslations } from "next-intl/server";
import { createSafeMaimaiImageUrl, isR2Url } from "@/lib/utils";
import { resolveBaseUrlFromHeaders } from "@/lib/base-url";
import { headers } from "next/headers";
import { getVersionInfo } from "@/lib/metadata";

export const runtime = "nodejs";
export const alt = "maimai song";
export const size = OG_SIZE;
export const contentType = "image/png";

type Props = {
  params: Promise<{ type: string; slug: string }>;
};

export default async function Image({ params }: Props) {
  const { type, slug } = await params;
  const locale = await getLocale();

  if (type !== "songs") {
    const t = await getTranslations("db.songs.metadata");
    return createHomeOGImage({
      tagline: t("description"),
      locale,
      logoFile: "icon-db-dark.webp",
      logoHeight: 220,
      accent: DB_ACCENT,
    });
  }

  const decodedSlug = decodeURIComponent(slug);
  const trpc = await createServerSideTRPC();
  const songs = await trpc.user.getAllUniqueSongs();
  const song = songs.find(s => s.slug === decodedSlug);

  if (!song) {
    const t = await getTranslations("db.songs.metadata");
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
