"use client";

import { TrendingUp } from "lucide-react";
import { Skeleton } from "@tomomai/ui";
import { useTranslations } from "next-intl";

export function HistoryCardSkeleton() {
  const t = useTranslations();
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <TrendingUp className="h-5 w-5" />
        {t("dataContent.history.title")}
      </h2>
      <div className="h-[400px] flex flex-col justify-end gap-2 p-4">
        <div className="flex-1 flex items-end gap-1">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton
              key={i}
              className="flex-1 rounded-t"
              style={{ height: `${30 + ((i * 37) % 60)}%` }}
            />
          ))}
        </div>
        <Skeleton className="h-4 w-full" />
      </div>
    </div>
  );
}
