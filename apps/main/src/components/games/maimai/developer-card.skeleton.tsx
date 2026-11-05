"use client";

import { Code } from "lucide-react";
import { Skeleton } from "@tomomai/ui";
import { useTranslations } from "next-intl";

export function DeveloperCardSkeleton() {
  const t = useTranslations();
  return (
    <div className="w-full mx-auto space-y-6">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <Code className="h-5 w-5" />
        {t("dataContent.tabs.developer")}
      </h2>
      <div className="space-y-4">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    </div>
  );
}
