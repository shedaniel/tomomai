import { cookies, headers } from 'next/headers';
import { Locale, defaultLocale, locales } from './locale';
import { isCNExclusive } from '@/lib/enabled-regions';

export async function getLocale(): Promise<Locale> {
  // If the region is China, return "zh-CN"
  if (isCNExclusive()) {
    return "zh-CN";
  }

  // Honor explicit `?tl=<locale>` (forwarded as `x-tl-locale` by middleware).
  // Highest precedence so SEO crawlers can index locale variants without
  // mutating the user's cookie.
  try {
    const headersList = await headers();
    const tl = headersList.get('x-tl-locale') as Locale | null;
    if (tl && locales.includes(tl)) return tl;
  } catch {
    // Headers unavailable during static generation — fall through.
  }

  try {
    // Try to get from cookie first (for immediate language switching)
    const cookieStore = await cookies();
    const localeCookie = cookieStore.get('NEXT_LOCALE')?.value as Locale;

    if (localeCookie && locales.includes(localeCookie)) {
      return localeCookie;
    }
  } catch {
    // If cookies() fails (e.g., during static generation), fall back to detection
    console.log('Unable to access cookies, will try to detect from headers');
  }

  // If no cookie, try to detect from Accept-Language header
  try {
    const headersList = await headers();
    const acceptLanguage = headersList.get('accept-language');

    if (acceptLanguage) {
      // Parse Accept-Language header (format: "en-US,en;q=0.9,ja;q=0.8")
      const languages = acceptLanguage
        .split(',')
        .map(lang => lang.split(';')[0].trim());

      // Try to find exact match first
      for (const lang of languages) {
        if (locales.includes(lang as Locale)) {
          return lang as Locale;
        }
      }

      // Try to find partial match (e.g., "en-US" -> "en")
      for (const lang of languages) {
        const shortLang = lang.split('-')[0];
        const match = locales.find(locale => locale.startsWith(shortLang));
        if (match) {
          return match;
        }
      }
    }
  } catch {
    console.log('Unable to access headers, using default locale');
  }

  // Default to English
  return defaultLocale;
}
