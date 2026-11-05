import { getLocale as getIntlLocale, setRequestLocale } from "next-intl/server";
import { Locale, defaultLocale, locales } from "@tomomai/i18n/locale";
import { getCurrentGame } from "@/lib/games/current";
import { isGameCnExclusive } from "@/lib/games/frontend";

/** Call in every layout/page using next-intl APIs to enable static rendering. */
export async function setStaticLocale(locale: string): Promise<void> {
  if ((locales as readonly string[]).includes(locale)) {
    setRequestLocale(locale);
  }
}

export async function getLocale(): Promise<Locale> {
  if (isGameCnExclusive(getCurrentGame())) return "zh-CN";

  try {
    const l = await getIntlLocale();
    return (l as Locale) ?? defaultLocale;
  } catch {
    return defaultLocale;
  }
}
