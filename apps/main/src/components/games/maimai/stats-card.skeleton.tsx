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
      <div className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-72 max-w-full" />
        </div>
        <div className="space-y-2.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className={`grid grid-cols-[4rem_1fr_2.75rem] sm:grid-cols-[5.5rem_1fr_4.5rem] items-center gap-2 sm:gap-3 ${i === 0 ? "pb-2.5 border-b border-dashed" : ""}`}>
              <Skeleton className="h-4 w-12" />
              <Skeleton className={`${i === 0 ? "h-4" : "h-3"} w-full rounded-full`} />
              <Skeleton className="h-3 w-10 ml-auto" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
