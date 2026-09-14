import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Analytics } from "@vercel/analytics/next";
import { LocaleProvider } from "@tomomai/i18n/client";
import { getLocale } from "@tomomai/i18n/server";
import { Toaster } from "@tomomai/ui";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { Noto_Sans_JP, Noto_Sans_SC, Noto_Sans_TC } from "next/font/google";
import localFont from "next/font/local";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { resolveBaseUrl } from "@/lib/base-url";
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

export const metadata: Metadata = {
  metadataBase: new URL(resolveBaseUrl()),
  title: {
    default: "tomomai Takeout",
    template: "%s | tomomai Takeout",
  },
  description: "Download your tomomai data as JSON.",
  icons: { apple: "/icon.png" },
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <body
        className={`${inter.variable} ${geistMono.variable} ${murecho.variable} ${notoSansJP.variable} ${notoSansSC.variable} ${notoSansTC.variable} antialiased bg-background min-h-dvh`}
      >
        <NextIntlClientProvider messages={messages}>
          <LocaleProvider initialLocale={locale} pathMode="cookie">
            <ThemeProvider>
              {children}
              <Toaster />
            </ThemeProvider>
          </LocaleProvider>
        </NextIntlClientProvider>
        <Analytics />
      </body>
    </html>
  );
}
