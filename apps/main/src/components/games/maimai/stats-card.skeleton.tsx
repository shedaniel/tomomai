"use client";

import { Skeleton } from "@tomomai/ui";
import { useTranslations } from "next-intl";

export function StatsCardSkeleton() {
  const t = useTranslations();
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">{t("playerStats.title")}</h2>
      <div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Skeleton className="h-10 w-full sm:w-[200px]" />
          <Skeleton className="h-10 w-full sm:w-[200px]" />
          <div className="flex-1" />
          <Skeleton className="h-8 w-full sm:w-40" />
        </div>
      </div>
      <div className="space-y-4">
        <Skeleton className="h-4 w-32" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Skeleton className="w-12 h-6 rounded" />
                <Skeleton className="h-4 w-24" />
              </div>
              <Skeleton className="h-4 w-12" />
            </div>
            <Skeleton className="h-2 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
