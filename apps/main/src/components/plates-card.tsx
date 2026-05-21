"use client";

import { Region, SnapshotWithSongs } from "@/lib/types";
import { useTranslations } from "next-intl";

export function PlatesCard({ }: { selectedSnapshotData: SnapshotWithSongs; region: Region }) {
  const t = useTranslations();

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">{t('dataContent.plates')}</h2>
      <div className="text-center text-muted-foreground">
        Plates Content
      </div>
    </div>
  );
}
