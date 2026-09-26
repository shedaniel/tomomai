import { getFrontendGame } from "@/lib/games/frontend-server";
import { createHomeOGImage, DB_ACCENT, OG_SIZE } from "@/lib/og";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/locale";
import { getOGImageLocales } from "@/i18n/og-locale";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ type: string }>;
};

export async function generateImageMetadata() {
  const locales = await getOGImageLocales();
  return locales.map(locale => ({ id: locale, alt: `${getFrontendGame().productName} database`, size: OG_SIZE, contentType: "image/png" as const }));
}

export default async function Image({ params, id }: Props & { id: Promise<string> }) {
  // TODO: Add CHUNITHM section images without relying on maimai score-detail support.
  if (getFrontendGame().id !== "maimai") return new Response(null, { status: 404 });
  const [{ type }, locale] = await Promise.all([params, id]) as [{ type: string }, Locale];

  let tagline: string;
  if (type === "songs") {
    tagline = (await getTranslations({ locale, namespace: "db.songs.metadata" }))("description", { game: getFrontendGame().displayName });
  } else if (type === "stats") {
    tagline = (await getTranslations({ locale, namespace: "db.stats" }))("description", { game: getFrontendGame().displayName });
  } else if (type === "events") {
    tagline = (await getTranslations({ locale, namespace: "db.events" }))("description", { game: getFrontendGame().displayName });
  } else {
    tagline = (await getTranslations({ locale, namespace: "db.songs.metadata" }))("description", { game: getFrontendGame().displayName });
  }

  return createHomeOGImage({
    tagline,
    locale,
    logoFile: "icon-db-dark.webp",
    logoHeight: 220,
    accent: DB_ACCENT,
  });
}
