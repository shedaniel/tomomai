import { resolveBaseUrl } from "@/lib/base-url";
import { defaultLocale, locales, type Locale } from "@/i18n/locale";
import { getLocale } from "@/i18n/locale-server";

const OG_LOCALE_MAP: Record<Locale, string> = {
  "en": "en_US",
  "en-GB": "en_GB",
  "ja": "ja_JP",
  "zh-CN": "zh_CN",
  "zh-HK": "zh_HK",
  "zh-TW": "zh_TW",
  "zh-SG": "zh_SG",
  "zh-MS": "zh_TW",
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
  options: { absolute?: boolean; locale?: Locale } = {},
): Promise<{
  canonical: string;
  languages: Record<string, string>;
}> {
  const base = options.absolute ? resolveBaseUrl() : "";
  const url = (p: string) => `${base}${p}`;
  const canonicalLocale = options.locale ?? (await getLocale());
  const languages: Record<string, string> = {};
  for (const l of locales) {
    languages[l] = url(localizePath(path, l));
  }
  languages["x-default"] = url(localizePath(path, defaultLocale));
  return {
    canonical: url(localizePath(path, canonicalLocale)),
    languages,
  };
}

/**
 * Return the absolute URL for the locale-specific opengraph-image variant.
 * Used in generateMetadata to pin the first og:image tag to the user's
 * current locale, while the ISR-cached variants from opengraph-image.tsx
 * (static locale ordering) follow in the head.
 */
export function ogImageUrl(path: string, locale: Locale): string {
  return `${resolveBaseUrl()}${localizePath(path, locale)}/opengraph-image/${locale}`;
}

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
export function siteJsonLd(): unknown[] {
  const baseUrl = resolveBaseUrl();
  return [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "tomomai",
      alternateName: "ともマイ",
      url: baseUrl,
      logo: `${baseUrl}/icon.png`,
      sameAs: [
        "https://github.com/shedaniel/maimai-friends",
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "tomomai ともマイ",
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
