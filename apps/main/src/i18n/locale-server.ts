import { headers } from "next/headers";
import { getLocale as getLocaleBase } from "@tomomai/i18n/server";
import { Locale, locales } from "@tomomai/i18n/locale";
import { isCNExclusive } from "@tomomai/catalog/enabled-regions";

export async function getLocale(): Promise<Locale> {
  return getLocaleBase({
    // CN-exclusive deployments are single-locale.
    forceLocale: () => (isCNExclusive() ? "zh-CN" : null),
    // Honor `?tl=<locale>` forwarded as `x-tl-locale` by middleware — lets
    // SEO crawlers index locale variants via hreflang without mutating
    // the user's NEXT_LOCALE cookie.
    headerLocale: async () => {
      try {
        const headersList = await headers();
        const tl = headersList.get("x-tl-locale") as Locale | null;
        if (tl && locales.includes(tl)) return tl;
      } catch {
        // headers() unavailable during static generation.
      }
      return null;
    },
  });
}
