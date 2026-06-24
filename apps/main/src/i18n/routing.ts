import { defineRouting } from 'next-intl/routing';
import { locales, defaultLocale } from '@tomomai/i18n/locale';

export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: 'always',
});
