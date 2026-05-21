import type { Metadata } from "next";
import { formatDateKey } from "./date-slug";

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
  if (isPast && dateKey && dateSlug) {
    const formatted = formatDateKey(dateKey, locale);
    title = t("titleForDate", { date: formatted });
    description = t("descriptionForDate", { date: formatted });
    url = `/${dateSlug}`;
  } else {
    title = t("title");
    description = t("description");
    url = "/";
  }
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      type: "website",
      siteName: "tomomai · Guesser",
      url,
      locale,
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
  };
}
