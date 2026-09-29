"use client";

import { Clock } from "lucide-react";
import { Skeleton } from "@tomomai/ui";
import { useTranslations } from "next-intl";

export function RecentSongsCardSkeleton() {
  const t = useTranslations("recentPlays");
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <Clock className="h-5 w-5" />
        {t("title")}
      </h2>
      <div className="divide-y divide-dashed divide-border">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-4 py-4">
            <Skeleton className="w-14 h-14 rounded shrink-0" />
            <div className="flex-1 min-w-0 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <div className="text-right space-y-2">
              <Skeleton className="h-4 w-16 ml-auto" />
              <Skeleton className="h-3 w-12 ml-auto" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
