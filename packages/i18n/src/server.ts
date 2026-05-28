import { cookies, headers } from 'next/headers';
import { Locale, defaultLocale, locales } from './locale';

export interface GetLocaleOptions {
  /**
   * Optional override that runs first. Return a locale to short-circuit
   * cookie / header detection (e.g. when a region is single-locale), or
   * null/undefined to fall through to normal detection.
   */
  forceLocale?: () => Locale | null | undefined | Promise<Locale | null | undefined>;
  /**
   * Optional override that runs before cookie/header detection. Mirrors
   * the `?tl=<locale>` "switch and stay" affordance used for SEO crawlers.
   */
  headerLocale?: () => Locale | null | undefined | Promise<Locale | null | undefined>;
}

export async function getLocale(opts: GetLocaleOptions = {}): Promise<Locale> {
  if (opts.forceLocale) {
    const forced = await opts.forceLocale();
    if (forced) return forced;
  }

  if (opts.headerLocale) {
    const fromHeader = await opts.headerLocale();
    if (fromHeader) return fromHeader;
  }

  try {
    const cookieStore = await cookies();
    const localeCookie = cookieStore.get('NEXT_LOCALE')?.value as Locale;
    if (localeCookie && locales.includes(localeCookie)) {
      return localeCookie;
    }
  } catch {
    // Static generation — fall through.
  }

  try {
    const headersList = await headers();
    const acceptLanguage = headersList.get('accept-language');
    if (acceptLanguage) {
      const languages = acceptLanguage
        .split(',')
        .map(lang => lang.split(';')[0].trim());
      for (const lang of languages) {
        if (locales.includes(lang as Locale)) return lang as Locale;
      }
      for (const lang of languages) {
        const shortLang = lang.split('-')[0];
        const match = locales.find(locale => locale.startsWith(shortLang));
        if (match) return match;
      }
    }
  } catch {
    // ignore
  }

  return defaultLocale;
}
