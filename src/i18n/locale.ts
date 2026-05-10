export type Locale = 'en' | 'en-GB' | 'ja' | 'zh-TW' | 'zh-HK' | 'zh-CN' | 'zh-SG' | 'ko';

export const defaultLocale: Locale = 'en';
export const locales: Locale[] = ['en', 'en-GB', 'ja', 'zh-TW', 'zh-HK', 'zh-CN', 'zh-SG', 'ko'];

export function setLocaleCookie(locale: Locale) {
  // This would be called from client-side when user changes language
  if (typeof document !== 'undefined') {
    document.cookie = `NEXT_LOCALE=${locale}; path=/; max-age=31536000`; // 1 year
  }
}

export function getLocaleCookie(): Locale | null {
  // Client-side cookie reading
  if (typeof document !== 'undefined') {
    const match = document.cookie.match(/NEXT_LOCALE=([^;]+)/);
    const locale = match?.[1] as Locale;
    return locale && locales.includes(locale) ? locale : null;
  }
  return null;
}
