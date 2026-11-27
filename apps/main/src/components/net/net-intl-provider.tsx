import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "@/i18n/locale-server";
import { loadNetMessages } from "@/lib/net/messages";

/** Hands client components under /net the net.* copy only, so the main site's bundle stays out of it. */
export async function NetIntlProvider({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  return (
    <NextIntlClientProvider locale={locale} messages={await loadNetMessages(locale)}>
      {children}
    </NextIntlClientProvider>
  );
}
