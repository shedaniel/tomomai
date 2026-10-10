"use client";

import { Badge } from "@tomomai/ui";
import { Grip } from "lucide-react";
import { useTranslations } from "next-intl";
import type { RecentDetailsProps } from "@/components/games/registry";

export function ChunithmRecentPlayDetails({ details: { playlog } }: RecentDetailsProps<"chunithm">) {
  const t = useTranslations("recentPlays");
  const judgments = [
    { label: "Justice Critical", value: playlog.judgments.justiceCritical },
    { label: "Justice", value: playlog.judgments.justice },
    { label: "Attack", value: playlog.judgments.attack },
    { label: "Miss", value: playlog.judgments.miss },
  ];
  const notes = [
    { label: "Tap", value: playlog.notePercentages.tap },
    { label: "Hold", value: playlog.notePercentages.hold },
    { label: "Slide", value: playlog.notePercentages.slide },
    { label: "Air", value: playlog.notePercentages.air },
    { label: "Flick", value: playlog.notePercentages.flick },
  ];

  return (
    <div className="space-y-3">
      <Badge variant="outline" className="gap-1 font-medium text-foreground">
        <Grip className="h-3 w-3" />
        <span>{t("labels.maxCombo")}</span>
        <span className="font-mono">{playlog.maxCombo}</span>
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
