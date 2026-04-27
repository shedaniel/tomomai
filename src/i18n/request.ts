import { getRequestConfig } from 'next-intl/server';
import { getLocale } from './locale-server';
import { deepMerge } from '@/lib/utils';
import { useAprilFools2026 } from '@/lib/flags';

function lowercaseMessages(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      result[key] = value.toLowerCase();
    } else if (typeof value === 'object' && value !== null) {
      result[key] = lowercaseMessages(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

export default getRequestConfig(async () => {
  const locale = await getLocale();

  let messages = deepMerge(
    (await import(`../../messages/en.json`)).default,
    (await import(`../../messages/${locale}.json`)).default,
  );

  if (await useAprilFools2026()) {
    messages = lowercaseMessages(messages) as typeof messages;
  }

  return {
    locale,
    messages,
  };
});
