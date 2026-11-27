import "server-only";
import { cache } from "react";
import { createTranslator, type AbstractIntlMessages } from "next-intl";
import { getLocale } from "@/i18n/locale-server";
import { deepMerge } from "@/lib/utils";
import type { Locale } from "@tomomai/i18n/locale";

/** One file per page under messages/net/<locale>/, each loaded under net.<file>. */
export const NET_MESSAGE_FILES = [
  "common", "premium", "home", "rating", "history", "options", "serial", "playData", "stampCard", "album",
  "friends", "ranking", "records", "recordDetail", "songs", "songDetail", "dan", "worldStats",
  "plates", "collection", "area", "event", "shop", "eggs",
] as const;
export type NetMessageFile = (typeof NET_MESSAGE_FILES)[number];

async function loadFile(locale: Locale, file: NetMessageFile): Promise<AbstractIntlMessages> {
  try {
    return (await import(`../../../messages/net/${locale}/${file}.json`)).default as AbstractIntlMessages;
  } catch {
    return {};
  }
}

/** The /net copy only, kept out of the site-wide bundle. English first with the locale's translation on top. */
export const loadNetMessages = cache(async (locale: Locale): Promise<AbstractIntlMessages> => {
  const entries = await Promise.all(NET_MESSAGE_FILES.map(async file => {
    const english = await loadFile("en", file);
    const translated = locale === "en" ? {} : await loadFile(locale, file);
    return [file, deepMerge(english, translated)] as const;
  }));
  return { net: Object.fromEntries(entries) };
});

/** Server-side translator for net.<namespace>. */
export async function getNetTranslations(namespace: NetMessageFile) {
  const locale = await getLocale();
  const messages = await loadNetMessages(locale);
  return createTranslator({ locale, messages, namespace: `net.${namespace}` as never }) as unknown as NetTranslator;
}

export type NetTranslator = {
  (key: string, values?: Record<string, string | number | Date>): string;
  rich: (key: string, values: Record<string, unknown>) => React.ReactNode;
  has: (key: string) => boolean;
};
