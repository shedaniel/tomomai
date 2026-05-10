import { resolveBaseUrl } from "@/lib/base-url";
import { locales, type Locale } from "@/i18n/locale";

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

/** Append `?tl=<locale>` (preserving existing query) onto a path. */
export function withTl(path: string, locale: Locale): string {
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}tl=${locale}`;
}

/**
 * Build canonical + hreflang alternates for a path. The canonical is the path
 * without `?tl=` (the cookie-/header-driven default rendition); each language
 * variant points at `<path>?tl=<locale>` so crawlers can fetch the locale they
 * want without disturbing the user's cookie.
 */
export function buildAlternates(
  path: string,
  options: { absolute?: boolean } = {},
): {
  canonical: string;
  languages: Record<string, string>;
} {
  const base = options.absolute ? resolveBaseUrl() : "";
  const url = (p: string) => `${base}${p}`;
  const languages: Record<string, string> = {};
  for (const l of locales) {
    languages[l] = url(withTl(path, l));
  }
  // Default rendition for crawlers without a preferred locale.
  languages["x-default"] = url(path);
  return {
    canonical: url(path),
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
  return `${resolveBaseUrl()}${path}/opengraph-image/${locale}`;
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
