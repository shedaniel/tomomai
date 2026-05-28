import { getRequestConfig } from 'next-intl/server';
import { getLocale } from '@tomomai/i18n/server';

function deepMerge<T extends Record<string, unknown>>(a: T, b: T): T {
  const out: Record<string, unknown> = { ...a };
  for (const [key, value] of Object.entries(b)) {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      out[key] &&
      typeof out[key] === 'object'
    ) {
      out[key] = deepMerge(out[key] as Record<string, unknown>, value as Record<string, unknown>);
    } else {
      out[key] = value;
    }
  }
  return out as T;
}

export default getRequestConfig(async ({ requestLocale }) => {
  const locale = (await requestLocale) ?? await getLocale();

  const en = (await import(`../../messages/en.json`)).default;
  let messages = en;
  if (locale !== 'en') {
    try {
      const localeMessages = (await import(`../../messages/${locale}.json`)).default;
      messages = deepMerge(en, localeMessages);
    } catch {
      messages = en;
    }
  }

  return { locale, messages };
});
