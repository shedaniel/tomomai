import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { Noto_Sans_JP, Noto_Sans_SC, Noto_Sans_TC } from "next/font/google";
import localFont from "next/font/local";
import { Analytics } from "@vercel/analytics/next";
import { Toaster } from "@tomomai/ui";
import { TurnstilePreclearance } from "@tomomai/ui/turnstile";
import { LocaleProvider } from "@tomomai/i18n/client";
import { getLocale } from "@tomomai/i18n/server";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { isHeardle } from "@/lib/heardle-config";
import "./globals.css";

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

const murecho = localFont({
  src: "../../public/res/fonts/Murecho-VariableFont_wght.woff2",
  variable: "--font-murecho",
  display: "swap",
  preload: false,
});

const notoSansJP = Noto_Sans_JP({
  variable: "--font-noto-jp",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
  preload: false,
});

const notoSansSC = Noto_Sans_SC({
  variable: "--font-noto-sc",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
  preload: false,
});

const notoSansTC = Noto_Sans_TC({
  variable: "--font-noto-tc",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
  preload: false,
});

import { resolveBaseUrl } from "@/lib/base-url";

export const metadata: Metadata = {
  // Resolves relative OG / Twitter image URLs against this base. Override via
  // NEXT_PUBLIC_SITE_URL in deployment env (Vercel / production); falls back
  // to the prod URL otherwise. Same helper used by `robots.ts` & sitemap.
  metadataBase: new URL(resolveBaseUrl()),
  // Generic fallback — per-page generateMetadata() overrides with mode-aware
  // strings (Guesser vs Heardle) sourced from i18n.
  title: "tomomai",
  description: "Daily maimai song puzzle.",
  icons: { apple: "/icon.png" },
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  const messages = await getMessages();
  const turnstileSiteKey =
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY
      ? process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
      : undefined;

  // Heardle gets a violet-leaning palette (--hue 290) to set it visually
  // apart from the neutral guesser theme. Override applies to both light
  // and dark schemes because --hue is consumed by both blocks.
  const themeStyle = isHeardle()
    ? ({ "--hue": "290" } as React.CSSProperties)
    : undefined;

  return (
    <html lang={locale} suppressHydrationWarning style={themeStyle}>
      <body
        className={`${inter.variable} ${geistMono.variable} ${murecho.variable} ${notoSansJP.variable} ${notoSansSC.variable} ${notoSansTC.variable} antialiased bg-background min-h-dvh`}
      >
        <NextIntlClientProvider messages={messages}>
          <LocaleProvider initialLocale={locale} pathMode="cookie">
            <ThemeProvider>
              {children}
              {turnstileSiteKey ? (
                <TurnstilePreclearance siteKey={turnstileSiteKey} />
              ) : null}
              <Toaster />
            </ThemeProvider>
          </LocaleProvider>
        </NextIntlClientProvider>
        <Analytics />
      </body>
    </html>
  );
}
