"use client";

import { Download } from "lucide-react";
import { Skeleton } from "@tomomai/ui";
import { useTranslations } from "next-intl";

export function ExportImageCardSkeleton() {
  const t = useTranslations();
  return (
    <div className="w-full mx-auto space-y-6">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <Download className="h-5 w-5" />
        {t("dataContent.tabs.exportImage")}
      </h2>
      <Skeleton className="w-full aspect-[3/4] max-w-md mx-auto rounded-lg" />
    </div>
  );
}
