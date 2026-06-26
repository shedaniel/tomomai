"use client";

import { Heart } from "lucide-react";
import { Skeleton } from "@tomomai/ui";
import { useTranslations } from "next-intl";

export function RecommendationCardSkeleton() {
  const t = useTranslations();
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Heart className="h-5 w-5 text-pink-500" />
          {t("dataContent.tabs.recommendations")}
        </h2>
        <div className="text-sm text-muted-foreground">
          {t("recommendations.description")}
        </div>
      </div>
      <div className="space-y-1">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center h-16 px-2 -mx-2 rounded-md">
            <Skeleton className="w-8 h-8 ml-1 mr-3 rounded shrink-0" />
            <div className="flex-1 min-w-0 space-y-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-2/3" />
            </div>
            <div className="text-right space-y-2 ml-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-3 w-16 ml-auto" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
