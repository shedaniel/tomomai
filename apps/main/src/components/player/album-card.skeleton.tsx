"use client";

import { Images } from "lucide-react";
import { Skeleton } from "@tomomai/ui";
import { useTranslations } from "next-intl";

export function AlbumCardSkeleton() {
  const t = useTranslations("albums");
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <Images className="h-5 w-5" />
        {t("title")}
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-3 p-4 border rounded-lg">
            <Skeleton className="w-full aspect-video rounded" />
            <div className="flex gap-3">
              <Skeleton className="w-14 h-14 rounded shrink-0 m-1" />
              <div className="flex-1 min-w-0 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-2.5 w-8" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
