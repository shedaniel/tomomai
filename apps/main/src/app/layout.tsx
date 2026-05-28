import { PreMaintenanceBanner } from '@/components/pre-maintenance-banner';
import { LocaleProvider } from '@/components/providers/locale-provider';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { TRPCProvider } from "@/components/providers/trpc-provider";
import { Toaster } from "@tomomai/ui";
import { getLocale } from '@/i18n/locale-server';
import { get } from '@vercel/edge-config';
import { VercelToolbar } from "@vercel/toolbar/next";
import type { Metadata } from "next";
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import localFont from "next/font/local";
import "./globals.css";
import "./cjk-fonts.css";
import "./vaul.css";
import { getServerThemeId } from '@/lib/themes-server';
import { getThemeOrDefault, getThemeStyleProperties } from '@/lib/themes';
import { useCustomThemes } from '@/lib/flags';
import { resolveBaseUrl } from '@/lib/base-url';
import { siteJsonLd } from '@/lib/seo';

const inter = localFont({
  src: "../../public/res/fonts/Inter-VariableFont_opsz_wght.woff2",
  variable: "--font-inter",
  display: "swap",
});

const geistMono = localFont({
  src: "../../public/res/fonts/GeistMono-VariableFont_wght.woff2",
  variable: "--font-geist-mono",
  display: "swap",
});

// NotoSansJP/TC/SC live in cjk-fonts.css (chunked, see docs/FONTS.md).
const murecho = localFont({
  src: "../../public/res/fonts/Murecho-VariableFont_wght.woff2",
  variable: "--font-murecho",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  metadataBase: new URL(resolveBaseUrl()),
  title: "tomomai ともマイ",
  description: "Track and analyze maimai scores with friends.",
  icons: {
    apple: "/icon.png",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Get messages for the current locale
  const locale = await getLocale();
  const themeId = await getServerThemeId();
  const theme = getThemeOrDefault(themeId);
  const messages = await getMessages();
  const shouldInjectToolbar = process.env.NODE_ENV === "development";

  let preMaintenanceBanner: { title: string; description: string; raw: string } | null = null;
  try {
    const raw = await get<string>('preMaintenanceMode');
    if (raw) {
      const parts = raw.split('||');
      if (parts.length >= 2) {
        preMaintenanceBanner = {
          title: parts[0].trim(),
          description: parts.slice(1).join('||').trim(),
          raw,
        };
      }
    }
  } catch {
    // Edge config unavailable, skip banner
  }

  return (
    <html lang={locale} className={theme.dark ? "dark" : ""} style={getThemeStyleProperties(theme)}>
      <head>
        <link rel="preconnect" href="https://cdn.tomomai.lol" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://cdn.tomomai.lol" />
        {siteJsonLd().map((entry, i) => (
          <script
            key={i}
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(entry) }}
          />
        ))}
      </head>
      <body
        className={`${inter.variable} ${geistMono.variable} ${murecho.variable} antialiased bg-background min-h-dvh`}
      >
        <NextIntlClientProvider messages={messages}>
          <LocaleProvider initialLocale={locale}>
            <ThemeProvider>
              <TRPCProvider>
                {preMaintenanceBanner && (
                  <PreMaintenanceBanner
                    title={preMaintenanceBanner.title}
                    description={preMaintenanceBanner.description}
                    raw={preMaintenanceBanner.raw}
                  />
                )}
                {children}
                {shouldInjectToolbar && <VercelToolbar />}
                <Toaster />
              </TRPCProvider>
            </ThemeProvider>
          </LocaleProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
