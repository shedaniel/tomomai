import type { Metadata } from "next";
import { formatDateKey, getDateKey } from "./date-slug";
import { isHeardle } from "./heardle-config";

type Translator = (key: string, values?: Record<string, string | number | Date>) => string;

type Args = {
  t: Translator;
  locale: string;
  /** When set, builds the past-date variant (`titleForDate` etc.). */
  dateKey?: string;
  /** Original URL slug — used for canonical/OG URL. Required when dateKey set. */
  dateSlug?: string;
};

/**
 * Daily-rotating OG image URL — the `?d=YYYY-MM-DD` query bust forces Discord
 * (and other link-unfurl caches) to re-fetch the freshly rendered image once
 * per JST day instead of pinning yesterday's puzzle forever.
 */
function ogImageUrl(pathPrefix: string, imageDateKey: string): string {
  return `${pathPrefix}/opengraph-image?d=${imageDateKey}`;
}

/**
 * Build the Next.js `Metadata` object for the homepage + past-date pages.
 * Branches on whether `dateKey`/`dateSlug` are present to pick the right
 * title/description keys; the OG/Twitter/alternates shape is identical in
 * both cases so it's expressed once here.
 */
export function buildGuessMetadata({ t, locale, dateKey, dateSlug }: Args): Metadata {
  const isPast = Boolean(dateKey && dateSlug);
  let title: string;
  let description: string;
  let url: string;
  let imageUrl: string;
  if (isPast && dateKey && dateSlug) {
    const formatted = formatDateKey(dateKey, locale);
    title = t("titleForDate", { date: formatted });
    description = t("descriptionForDate", { date: formatted });
    url = `/${dateSlug}`;
    imageUrl = ogImageUrl(`/${dateSlug}`, dateKey);
  } else {
    title = t("title");
    description = t("description");
    url = "/";
    imageUrl = ogImageUrl("", getDateKey());
  }
  const siteName = isHeardle() ? "tomomai · Heardle" : "tomomai · Guesser";
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      type: "website",
      siteName,
      url,
      locale,
      images: [imageUrl],
    },
    twitter: {
      card: "summary",
      title,
      description,
      images: [imageUrl],
    },
  };
}

/** Translation namespace for metadata strings, switched per deployment mode. */
export function metaNamespace(): "guess.meta" | "heardle.meta" {
  return isHeardle() ? "heardle.meta" : "guess.meta";
}
