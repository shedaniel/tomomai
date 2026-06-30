import type { ReactNode } from "react";
import type { Metadata } from "next";
import localFont from "next/font/local";
import { SiteFooter } from "@/components/site-footer";
import {
  DEFAULT_THEME_ID,
  getThemeOrDefault,
  getThemeStyleProperties,
  themeNoFlashScript,
} from "@/lib/themes";

const inter = localFont({
  src: "../../../public/res/fonts/Inter-VariableFont_opsz_wght.woff2",
  variable: "--font-inter",
  display: "swap",
});

const geistMono = localFont({
  src: "../../../public/res/fonts/GeistMono-VariableFont_wght.woff2",
  variable: "--font-geist-mono",
  display: "swap",
});

// NotoSansJP/TC/SC live in cjk-fonts.css (chunked, see docs/FONTS.md).
const murecho = localFont({
  src: "../../../public/res/fonts/Murecho-VariableFont_wght.woff2",
  variable: "--font-murecho",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "tomomai ともマイ",
};

// Legal pages are locale-independent and served at a fixed /tos, /privacy URL.
// They reuse the site theme/fonts but skip the i18n + tRPC providers, since the
// policy text is English-only and needs no client providers.
export default function LegalLayout({ children }: { children: ReactNode }) {
  const theme = getThemeOrDefault(DEFAULT_THEME_ID);

  return (
    <html
      lang="en"
      className={theme.dark ? "dark" : ""}
      style={getThemeStyleProperties(theme)}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeNoFlashScript() }} />
      </head>
      <body
        className={`${inter.variable} ${geistMono.variable} ${murecho.variable} antialiased bg-background flex min-h-dvh flex-col`}
      >
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
