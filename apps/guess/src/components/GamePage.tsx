import { getTranslations } from "next-intl/server";
import { getLocale } from "@tomomai/i18n/server";
import { GameClient } from "@/components/GameClient";
import { HostLabel } from "@/components/HostLabel";
import { PastBanner } from "@/components/PastBanner";
import { SiteHeader } from "@/components/SiteHeader";
import { TOTAL_STEPS } from "@/lib/types";
import { formatDateKey } from "@/lib/date-slug";
import { metaNamespace } from "@/lib/metadata";

type Props = {
  dateKey: string;
  /** Past-date slug to thread through API URLs. Omit for `/` (today). */
  dateSlug?: string;
};

/**
 * Shared page shell used by both `/` (today's puzzle) and `/[date]` (past
 * puzzles). All date-resolution decisions are made by the caller; this
 * component just renders the chrome + GameClient with the given dateKey.
 */
export async function GamePage({ dateKey, dateSlug }: Props) {
  const [tMeta, locale] = await Promise.all([
    getTranslations(metaNamespace()),
    getLocale(),
  ]);
  const isPast = Boolean(dateSlug);
  const formattedDate = isPast ? formatDateKey(dateKey, locale) : "";
  return (
    <div className="container mx-auto max-w-md px-4 min-h-dvh flex flex-col">
      {/* SR-only h1 so the page has a semantic top-level heading for SEO
          and screen-readers — the visual design uses the logo image. */}
      <h1 className="sr-only">{tMeta("title")}</h1>
      <SiteHeader belowLocale={<HostLabel dateKey={dateKey} />} />
      {isPast && <PastBanner formattedDate={formattedDate} />}
      <div className="flex-1 flex flex-col justify-center pt-8 pb-6">
        <GameClient
          dateKey={dateKey}
          dateSlug={dateSlug}
          totalSteps={TOTAL_STEPS}
        />
      </div>
    </div>
  );
}
