import { locales, defaultLocale, type Locale } from './locale';
import { getLocale } from './locale-server';

// For use in generateImageMetadata — does NOT call headers(), safe for ISR static routes.
export function getStaticOGImageLocales(): Locale[] {
  return locales;
}

// For use in page-level generateMetadata where headers() is already expected.
export async function getOGImageLocales(): Promise<Locale[]> {
  let current: Locale;
  try {
    current = await getLocale();
  } catch {
    current = defaultLocale;
  }
  return [current, ...locales.filter(l => l !== current)];
}
