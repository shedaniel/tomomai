"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Region, SnapshotWithSongs } from "@/lib/types";
import { useTranslations } from "next-intl";

export function PlatesCard({ }: { selectedSnapshotData: SnapshotWithSongs; region: Region }) {
  const t = useTranslations();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('dataContent.plates')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-center text-muted-foreground">
          Plates Content
        </div>
      </CardContent>
    </Card>
  );
}
