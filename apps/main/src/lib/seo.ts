import type { Metadata } from "next";
import { resolveBaseUrl } from "@/lib/base-url";
import { defaultLocale, locales, type Locale } from "@/i18n/locale";
import { getLocale } from "@/i18n/locale-server";
import { brandTitle } from "@/lib/games/frontend";
import type { GameBrand } from "@/lib/games/types";

const OG_LOCALE_MAP: Record<Locale, string> = {
  "en": "en_US",
  "en-GB": "en_GB",
  "ja": "ja_JP",
  "zh-CN": "zh_CN",
  "zh-HK": "zh_HK",
  "zh-TW": "zh_TW",
  "zh-SG": "zh_SG",
  "ko": "ko_KR",
};

/** Convert our internal locale code to the BCP-47-ish form used by og:locale. */
export function ogLocale(locale: Locale): string {
  return OG_LOCALE_MAP[locale] ?? "en_US";
}

/** Build the og:locale + og:locale:alternate pair for a page. */
export function openGraphLocales(currentLocale: Locale): {
  locale: string;
  alternateLocale: string[];
} {
  return {
    locale: ogLocale(currentLocale),
    alternateLocale: locales.filter((l) => l !== currentLocale).map(ogLocale),
  };
}

/** Prefix a path with a locale segment, handling the root path. */
export function localizePath(path: string, locale: Locale): string {
  return `/${locale}${path === "/" ? "" : path}`;
}

/**
 * Build canonical + hreflang alternates for a path under `[locale]` routing.
 * Each language variant points at `/{locale}{path}` so crawlers can fetch the
 * locale they want; the canonical is the current page's localized URL (falling
 * back to the default locale when `locale` is not provided).
 */
export async function buildAlternates(
  path: string,
  options: { absolute?: boolean; locale?: Locale; locales?: readonly Locale[] } = {},
): Promise<{
  canonical: string;
  languages: Record<string, string>;
}> {
  const base = options.absolute ? resolveBaseUrl() : "";
  const url = (p: string) => `${base}${p}`;
  const canonicalLocale = options.locale ?? (await getLocale());
  const languages: Record<string, string> = {};
  for (const l of options.locales ?? locales) {
    languages[l] = url(localizePath(path, l));
  }
  languages["x-default"] = url(localizePath(path, defaultLocale));
  return {
    canonical: url(localizePath(path, canonicalLocale)),
    languages,
  };
}

/** The absolute URL of the page's own opengraph-image in the given locale. */
function ogImageUrl(path: string, locale: Locale): string {
  return `${resolveBaseUrl()}${localizePath(path, locale)}/opengraph-image/${locale}`;
}

type PageMetadataInput = {
  brand: GameBrand;
  locale: Locale;
  /** The path under the locale segment, such as "/db/songs". */
  path: string;
  title: string;
  description: string;
  /** What link previews show instead of the page title. */
  ogTitle?: string;
  ogDescription?: string;
  /**
   * "route" links the opengraph-image beside the page. "none" publishes no image. Next only falls back to a
   * route's image file when `images` is absent, so every page states one or the other.
   */
  image: "route" | "none";
  /** The locales the page exists in, every locale by default. */
  locales?: readonly Locale[];
  /** Kept out of search results, so the page also publishes no canonical or language links. */
  noindex?: true;
} & ({ ogType: "website" | "profile" } | { ogType: "article"; publishedTime?: string });

export async function buildPageMetadata(input: PageMetadataInput): Promise<Metadata> {
  const { brand, locale, path, title, description, image } = input;
  const ogDescription = input.ogDescription ?? description;
  const openGraph = {
    title: input.ogTitle ?? title,
    description: ogDescription,
    url: localizePath(path, locale),
    siteName: brandTitle(brand),
    images: image === "route" ? [{ url: ogImageUrl(path, locale) }] : [],
    ...openGraphLocales(locale),
  };
  return {
    title,
    description,
    ...(input.noindex
      ? { robots: { index: false, follow: false } }
      : { alternates: await buildAlternates(path, { locale, locales: input.locales }) }),
    openGraph: input.ogType === "article"
      ? { ...openGraph, type: "article", publishedTime: input.publishedTime }
      : { ...openGraph, type: input.ogType },
    twitter: {
      card: "summary_large_image",
      title,
      description: ogDescription,
    },
  };
}

/**
 * For a path that renders a not-found state. The empty images keep Next from linking the route's
 * opengraph-image, which has nothing to draw there.
 */
export const MISSING_PAGE_METADATA: Metadata = {
  robots: { index: false, follow: false },
  openGraph: { images: [] },
};

export type BreadcrumbItem = { name: string; url: string };

export function breadcrumbJsonLd(items: BreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: it.url,
    })),
  };
}

/** Site-level Organization + WebSite JSON-LD for the root layout. */
export function siteJsonLd(brand: GameBrand): unknown[] {
  const baseUrl = resolveBaseUrl();
  return [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: brand.productName,
      alternateName: brand.japaneseName,
      url: baseUrl,
      ...(brand.icon && { logo: `${baseUrl}${brand.icon}` }),
      sameAs: brand.sameAs,
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: brandTitle(brand),
      url: baseUrl,
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: `${baseUrl}/db/songs?q={search_term_string}`,
        },
        "query-input": "required name=search_term_string",
      },
    },
  ];
}
