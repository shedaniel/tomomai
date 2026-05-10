import { createHomeOGImage, DB_ACCENT, OG_SIZE } from "@/lib/og";
import { getTranslations } from "next-intl/server";
import { getLocale } from "@/i18n/locale-server";

export const runtime = "nodejs";
export const alt = "tomomai database";
export const size = OG_SIZE;
export const contentType = "image/png";

type Props = {
  params: Promise<{ type: string }>;
};

export default async function Image({ params }: Props) {
  const { type } = await params;
  const locale = await getLocale();

  let tagline: string;
  if (type === "songs") {
    tagline = (await getTranslations("db.songs.metadata"))("description");
  } else if (type === "stats") {
    tagline = (await getTranslations("db.stats"))("description");
  } else if (type === "events") {
    tagline = (await getTranslations("db.events"))("description");
  } else {
    tagline = (await getTranslations("db.songs.metadata"))("description");
  }

  return createHomeOGImage({
    tagline,
    locale,
    logoFile: "icon-db-dark.webp",
    logoHeight: 220,
    accent: DB_ACCENT,
  });
}
