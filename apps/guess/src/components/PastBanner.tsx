"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { Button } from "@tomomai/ui";

type Props = {
  /** Localized formatted date string (e.g. "May 20, 2026"). */
  formattedDate: string;
};

/**
 * Past-date banner shown above the deck on `/[date]` routes. Lives in a
 * client component because `@tomomai/ui`'s `Button` wraps its `onClick` for
 * haptics — rendering it from a server component throws "Event handlers
 * cannot be passed to Client Component props".
 */
export function PastBanner({ formattedDate }: Props) {
  const t = useTranslations("guess.pastBanner");
  return (
    <div className="rounded-lg border-2 border-border bg-card/60 px-4 py-3 mt-2 flex items-center justify-between gap-3 shrink-0">
      <p className="text-sm leading-snug text-foreground">
        {t("text", { date: formattedDate })}
      </p>
      <Link href="/" className="shrink-0">
        <Button variant="outline" size="sm">
          {t("button")}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </Link>
    </div>
  );
}
