import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { Noto_Sans_JP, Noto_Sans_SC, Noto_Sans_TC } from "next/font/google";
import localFont from "next/font/local";
import { Toaster } from "@tomomai/ui";
import { LocaleProvider } from "@tomomai/i18n/client";
import { getLocale } from "@tomomai/i18n/server";
import { ThemeProvider } from "@/components/providers/theme-provider";
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
  title: "Guess the maimai song",
  description: "Guess the maimai song.",
  icons: { apple: "/icon.png" },
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <body
        className={`${inter.variable} ${geistMono.variable} ${murecho.variable} ${notoSansJP.variable} ${notoSansSC.variable} ${notoSansTC.variable} antialiased bg-background min-h-dvh`}
      >
        <NextIntlClientProvider messages={messages}>
          <LocaleProvider initialLocale={locale}>
            <ThemeProvider>
              {children}
              <Toaster />
            </ThemeProvider>
          </LocaleProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
