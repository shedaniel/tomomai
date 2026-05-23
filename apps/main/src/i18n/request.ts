import { getRequestConfig } from 'next-intl/server';
import { getLocale } from './locale-server';
import { deepMerge } from '@/lib/utils';

export default getRequestConfig(async ({ requestLocale }) => {
  const locale = (await requestLocale) ?? await getLocale();

  const messages = deepMerge(
    (await import(`../../messages/en.json`)).default,
    (await import(`../../messages/${locale}.json`)).default,
  );

  return {
    locale,
    messages,
  };
});
