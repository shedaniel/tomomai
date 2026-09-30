import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/locale";
import type { FrontendGame } from "@/lib/games/frontend";
import type { CatalogSectionId } from "@/lib/games/types";

export type CatalogCopy = { title: string; description: string };

const DATABASE_COPY = "db.songs.metadata";

/** The message namespace holding each section's title and description. */
const SECTION_COPY: Record<CatalogSectionId, string | null> = {
  songs: DATABASE_COPY,
  stats: "db.stats",
  events: "db.events",
  arcades: null,
  // The static /db/posts route takes precedence over [type] and names itself.
  posts: null,
};

async function translateCopy(namespace: string, locale: Locale, game: Pick<FrontendGame, "brand">): Promise<CatalogCopy> {
  const t = await getTranslations({ locale, namespace });
  const values = { game: game.brand.displayName };
  return { title: t("title", values), description: t("description", values) };
}

/** A section's title and description, or null for a section with no copy of its own. */
export function getCatalogSectionCopy(section: CatalogSectionId, locale: Locale, game: Pick<FrontendGame, "brand">): Promise<CatalogCopy | null> {
  const namespace = SECTION_COPY[section];
  return namespace ? translateCopy(namespace, locale, game) : Promise.resolve(null);
}

/** The database's own copy, which pages without copy of their own show on their images. */
export function getDatabaseCopy(locale: Locale, game: Pick<FrontendGame, "brand">): Promise<CatalogCopy> {
  return translateCopy(DATABASE_COPY, locale, game);
}
