"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface TitleRankingTableProps {
  data: { title: string; percentage: number }[];
}

export function TitleRankingTable({ data }: TitleRankingTableProps) {
  const t = useTranslations("db.stats");

  return (
    <div className="rounded-md border">
      <div className="divide-y divide-border divide-dashed">
        {/* Header */}
        <div className="grid grid-cols-[auto_1fr_auto] gap-4 p-3 font-medium text-sm text-muted-foreground bg-muted/50">
          <div className="w-8 text-center">{t("table.rank")}</div>
          <div>{t("table.title")}</div>
          <div className="text-right">{t("table.percentage")}</div>
        </div>

        {/* Rows */}
        {data.map((item, index) => (
          <div
            key={item.title}
            className="grid grid-cols-[auto_1fr_auto] gap-4 p-3 items-center hover:bg-muted/20 transition-colors"
          >
            <div className="w-8 text-center font-mono text-sm text-muted-foreground">
              #{index + 1}
            </div>
            <div className="font-medium truncate">{item.title}</div>
            <div className="text-right font-mono text-sm">
              {(item.percentage * 100).toFixed(2)}%
            </div>
          </div>
        ))}

        {data.length === 0 && (
          <div className="p-8 text-center text-muted-foreground">
            {t("noDataAvailable")}
          </div>
        )}
      </div>
    </div>
  );
}
