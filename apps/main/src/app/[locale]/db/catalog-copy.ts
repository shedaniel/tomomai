import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/locale";
import type { FrontendGame } from "@/lib/games/frontend";
import type { CatalogSectionId } from "@/lib/games/types";

export type CatalogCopy = { title: string; description: string };

type SectionCopy = {
  /** The message namespace holding the title and description. */
  namespace: string;
  /** The message naming the game in this copy, where its localized name differs from the brand's display name. */
  gameName?: string;
};

const DATABASE_COPY: SectionCopy = { namespace: "db.songs.metadata", gameName: "db.songs.gameName" };

const SECTION_COPY: Record<CatalogSectionId, SectionCopy | null> = {
  songs: DATABASE_COPY,
  stats: { namespace: "db.stats" },
  events: { namespace: "db.events" },
  arcades: null,
  // The static /db/posts route takes precedence over [type] and names itself.
  posts: null,
};

async function translateCopy({ namespace, gameName }: SectionCopy, locale: Locale, game: Pick<FrontendGame, "brand">): Promise<CatalogCopy> {
  const t = await getTranslations({ locale });
  const values = { game: gameName ? t(gameName) : game.brand.displayName };
  return { title: t(`${namespace}.title`, values), description: t(`${namespace}.description`, values) };
}

/** A section's title and description, or null for a section with no copy of its own. */
export function getCatalogSectionCopy(section: CatalogSectionId, locale: Locale, game: Pick<FrontendGame, "brand">): Promise<CatalogCopy | null> {
  const copy = SECTION_COPY[section];
  return copy ? translateCopy(copy, locale, game) : Promise.resolve(null);
}

/** The database's own copy, which pages without copy of their own show on their images. */
export function getDatabaseCopy(locale: Locale, game: Pick<FrontendGame, "brand">): Promise<CatalogCopy> {
  return translateCopy(DATABASE_COPY, locale, game);
}
