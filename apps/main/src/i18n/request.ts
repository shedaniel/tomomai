import { getRequestConfig } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { routing } from './routing';
import { deepMerge } from '@/lib/utils';

export default getRequestConfig(async ({ requestLocale }) => {
  // `requestLocale` is populated from the `[locale]` segment by next-intl's
  // App Router plugin, and pinned for static rendering via `setRequestLocale`
  // in each layout/page. We no longer read cookies/headers here — that was
  // what made every page dynamic and uncacheable.
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  const messages = deepMerge(
    (await import(`../../messages/en.json`)).default,
    (await import(`../../messages/${locale}.json`)).default,
  );

  return {
    locale,
    messages,
  };
});
