import { LocaleProvider } from '@/components/providers/locale-provider';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { TRPCProvider } from "@/components/providers/trpc-provider";
import { Toaster } from "@tomomai/ui";
import { TurnstilePreclearance } from "@tomomai/ui/turnstile";
import { VercelToolbar } from "@vercel/toolbar/next";
import type { Metadata } from "next";
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { setStaticLocale } from '@/i18n/locale-server';
import { notFound } from 'next/navigation';
import localFont from "next/font/local";
import { routing } from '@/i18n/routing';
import type { Locale } from '@tomomai/i18n/locale';
import { DEFAULT_THEME_ID, getThemeOrDefault, getThemeStyleProperties, themeNoFlashScript } from '@/lib/themes';
import { resolveBaseUrl } from '@/lib/base-url';
import { siteJsonLd } from '@/lib/seo';
import { SiteFooter } from '@/components/site-footer';
import { PreMaintenanceBanner } from '@/components/pre-maintenance-banner';
import { GameProvider } from '@/components/providers/game-provider';
import { AuthDialogProvider } from '@/components/auth/auth-dialog-provider';
import { getCurrentGame } from '@/lib/games/current';
import { brandTitle } from '@/lib/games/frontend';

const TURNSTILE_SITE_KEY =
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY
    ? process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
    : undefined;

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

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { locale } = await params;
  const { brand } = getCurrentGame();
  const t = await getTranslations({ locale: hasLocale(routing.locales, locale) ? locale : routing.defaultLocale, namespace: "dashboard" });
  return {
    metadataBase: new URL(resolveBaseUrl()),
    title: brandTitle(brand),
    description: t("description", { game: brand.displayName }),
    icons: brand.icon ? { apple: brand.icon } : undefined,
  };
}

// Pre-render every supported locale at build time so the [locale] subtree is
// statically renderable / ISR-cacheable. Individual pages opt into further
// caching via `revalidate` / `generateStaticParams`.
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  await setStaticLocale(locale);

  const messages = await getMessages();
  const typedLocale = locale as Locale;
  const game = getCurrentGame();

  // SSR the default theme; the user's saved theme is applied pre-paint by
  // the blocking no-flash script below (cookie read happens in the browser,
  // so this stays static/cacheable instead of forcing the layout dynamic).
  const theme = getThemeOrDefault(DEFAULT_THEME_ID);

  const shouldInjectToolbar = process.env.NODE_ENV === "development";

  return (
    <html lang={typedLocale} className={theme.dark ? "dark" : ""} style={getThemeStyleProperties(theme)} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeNoFlashScript() }} />
        <link rel="preconnect" href="https://cdn.tomomai.lol" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://cdn.tomomai.lol" />
        {siteJsonLd(game.brand).map((entry, i) => (
          <script
            key={i}
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(entry) }}
          />
        ))}
      </head>
      <body
        className={`${inter.variable} ${geistMono.variable} ${murecho.variable} antialiased bg-background flex min-h-dvh flex-col`}
      >
        <NextIntlClientProvider messages={messages}>
          <GameProvider game={game}>
            <LocaleProvider initialLocale={typedLocale}>
              <ThemeProvider>
                <TRPCProvider>
                  <AuthDialogProvider>
                    {TURNSTILE_SITE_KEY && <TurnstilePreclearance siteKey={TURNSTILE_SITE_KEY} />}
                    <PreMaintenanceBanner />
                    {children}
                    <SiteFooter />
                    {shouldInjectToolbar && <VercelToolbar />}
                    <Toaster />
                  </AuthDialogProvider>
                </TRPCProvider>
              </ThemeProvider>
            </LocaleProvider>
          </GameProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
