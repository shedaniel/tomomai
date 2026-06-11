"use client";

import { LocaleProvider as BaseLocaleProvider } from "@tomomai/i18n/client";
import type { Locale } from "@tomomai/i18n/locale";
import { isCNExclusive } from "@tomomai/catalog/enabled-regions";

export { useLocale } from "@tomomai/i18n/client";

interface LocaleProviderProps {
  children: React.ReactNode;
  initialLocale: Locale;
}

export function LocaleProvider({ children, initialLocale }: LocaleProviderProps) {
  // CN-exclusive deployments are single-locale; pinning here lets every
  // `useLocale()` consumer return 'zh-CN' with a no-op `setLocale` without
  // each one having to import the region check itself.
  const forcedLocale: Locale | undefined = isCNExclusive() ? "zh-CN" : undefined;
  return (
    <BaseLocaleProvider initialLocale={initialLocale} forcedLocale={forcedLocale}>
      {children}
    </BaseLocaleProvider>
  );
}
