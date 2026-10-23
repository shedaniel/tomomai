"use client";

import { Heart } from "lucide-react";
import { Skeleton } from "@tomomai/ui";
import { useTranslations } from "next-intl";

export function RecommendationCardSkeleton() {
  const t = useTranslations();
  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Heart className="h-5 w-5 text-pink-500" />
            {t("dataContent.tabs.recommendations")}
          </h2>
          <Skeleton className="h-8 w-20 rounded-md" />
        </div>
        <div className="text-sm text-muted-foreground">
          {t("recommendations.description")}
        </div>
        <div className="pt-4">
          <div className="grid h-9 w-full grid-cols-2 items-center rounded-lg bg-muted p-[3px] text-sm font-medium text-muted-foreground">
            <div className="flex h-full items-center justify-center rounded-md bg-background shadow-sm dark:bg-input/30">
              {t("recommendations.tabs.improve")}
            </div>
            <div className="flex items-center justify-center">
              {t("recommendations.tabs.tryNew")}
            </div>
          </div>
        </div>
      </div>
      <div className="divide-y divide-dashed divide-border">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i}>
            <div className="flex xs:items-center min-h-16 py-2 max-xs:min-h-30 max-xs:flex-col max-xs:gap-y-2 px-2 -mx-2">
              <div className="flex items-center xs:flex-1 min-w-0 min-h-12 max-xs:mt-1.5">
                <Skeleton className="w-8 h-8 ml-1 mr-3 rounded shrink-0" />
                <div className="flex-1 min-w-0 space-y-2">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="xs:ml-2 space-y-1.5 xs:items-end flex flex-col">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-16" />
                </div>
                <div className="ml-4 mr-2 w-16 space-y-1.5">
                  <Skeleton className="h-3 w-14" />
                  <Skeleton className="h-3 w-10" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
