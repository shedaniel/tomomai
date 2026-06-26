"use client";

import { Map } from "lucide-react";
import { Skeleton } from "@tomomai/ui";
import { useTranslations } from "next-intl";

export function EventsCardSkeleton() {
  const t = useTranslations();
  return (
    <div className="w-full space-y-6">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <Map className="h-5 w-5" />
        {t("events.title")}
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex gap-3 p-4 border rounded-lg">
            <Skeleton className="w-16 h-16 rounded shrink-0" />
            <div className="flex-1 min-w-0 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-2 w-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
