"use client";

import type { ChunithmRecentDetails } from "@/lib/games/chunithm/recent-details";
import type { RecentPlay } from "@/lib/trpc-types";
import { AutoHeight } from "@/components/animate-ui/primitives/effects/auto-height";
import { Badge } from "@tomomai/ui";
import { Grip } from "lucide-react";
import { useTranslations } from "next-intl";

export function ChunithmRecentPlayDetails({ play, isExpanded }: { play: RecentPlay; isExpanded: boolean }) {
  if (!play.chunithmDetails) return null;
  return (
    <AutoHeight deps={[isExpanded]}>
      {isExpanded && <DetailsPanel details={play.chunithmDetails} />}
    </AutoHeight>
  );
}

function DetailsPanel({ details }: { details: ChunithmRecentDetails }) {
  const t = useTranslations("recentPlays");
  const judgments = [
    { label: "Justice Critical", value: details.judgments.justiceCritical },
    { label: "Justice", value: details.judgments.justice },
    { label: "Attack", value: details.judgments.attack },
    { label: "Miss", value: details.judgments.miss },
  ];
  const notes = [
    { label: "Tap", value: details.notePercentages.tap },
    { label: "Hold", value: details.notePercentages.hold },
    { label: "Slide", value: details.notePercentages.slide },
    { label: "Air", value: details.notePercentages.air },
    { label: "Flick", value: details.notePercentages.flick },
  ];

  return (
    <div className="space-y-3 pt-6">
      <Badge variant="outline" className="gap-1 font-medium text-foreground">
        <Grip className="h-3 w-3" />
        <span>{t("labels.maxCombo")}</span>
        <span className="font-mono">{details.maxCombo}</span>
      </Badge>
      <div>
        <h5 className="mb-2 text-xs font-medium text-muted-foreground">{t("labels.judgments")}</h5>
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border bg-border sm:grid-cols-4">
          {judgments.map(({ label, value }) => (
            <div key={label} className="bg-background px-2 py-2 text-center text-xs">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="mt-1 font-mono font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div>
        <h5 className="mb-2 text-xs font-medium text-muted-foreground">{t("notesBreakdown.percentages")}</h5>
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border bg-border sm:grid-cols-5">
          {notes.map(({ label, value }) => (
            <div key={label} className="bg-background px-2 py-2 text-center text-xs">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="mt-1 font-mono font-medium">{value}%</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
