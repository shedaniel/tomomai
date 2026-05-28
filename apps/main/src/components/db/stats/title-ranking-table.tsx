"use client";

import { useTranslations } from "next-intl";
import { ExpandableList } from "./expandable-list";

interface TitleRankingTableProps {
  data: { title: string; percentage: number }[];
  collapsedCount?: number;
}

export function TitleRankingTable({ data, collapsedCount = 5 }: TitleRankingTableProps) {
  const t = useTranslations("db.stats");

  return (
    <div className="rounded-md border overflow-hidden">
      <div className="divide-y divide-border divide-dashed">
        <div className="grid grid-cols-[auto_1fr_auto] gap-4 p-3 font-medium text-sm text-muted-foreground bg-muted/50">
          <div className="w-8 text-center">{t("table.rank")}</div>
          <div>{t("table.title")}</div>
          <div className="text-right">{t("table.percentage")}</div>
        </div>
      </div>
      <ExpandableList
        items={data}
        collapsedCount={collapsedCount}
        emptyState={
          <div className="p-8 text-center text-muted-foreground">
            {t("noDataAvailable")}
          </div>
        }
        renderItem={(item, index) => (
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
        )}
      />
    </div>
  );
}
