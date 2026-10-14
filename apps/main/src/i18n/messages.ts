import type { AbstractIntlMessages } from "next-intl";
import type { CanonicalGameId } from "@/lib/games/ids";
import { deepMerge } from "@/lib/utils";
import type { Locale } from "./locale";

/**
 * The copy every site shares, then the game's own copy from messages/games/<game>, each in English
 * with the locale's translation on top.
 */
export async function loadMessages(game: CanonicalGameId, locale: Locale): Promise<AbstractIntlMessages> {
  const layers = await Promise.all([
    import("../../messages/en.json"),
    import(`../../messages/${locale}.json`),
    import(`../../messages/games/${game}/en.json`),
    import(`../../messages/games/${game}/${locale}.json`),
  ]);
  return layers.reduce<AbstractIntlMessages>((messages, layer) => deepMerge(messages, layer.default), {});
}
