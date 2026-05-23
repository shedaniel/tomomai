"use client";

import { ReactNode, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import { AutoHeight } from "@/components/animate-ui/primitives/effects/auto-height";
import { cn } from "@/lib/utils";

interface ExpandableListProps<T> {
  items: T[];
  collapsedCount: number;
  renderItem: (item: T, index: number) => ReactNode;
  emptyState?: ReactNode;
}

/**
 * Renders the first `collapsedCount` items, with an animated expand toggle
 * to reveal the rest. Height changes are animated via <AutoHeight>.
 */
export function ExpandableList<T>({
  items,
  collapsedCount,
  renderItem,
  emptyState,
}: ExpandableListProps<T>) {
  const t = useTranslations("db.stats");
  const [expanded, setExpanded] = useState(false);
  const canExpand = items.length > collapsedCount;
  const shown = expanded || !canExpand ? items : items.slice(0, collapsedCount);

  if (items.length === 0) return <>{emptyState}</>;

  return (
    <>
      <AutoHeight deps={[expanded, items.length]}>
        <div className="divide-y divide-border divide-dashed">
          {shown.map((item, index) => renderItem(item, index))}
        </div>
      </AutoHeight>
      {canExpand && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center justify-center gap-1.5 w-full p-2.5 text-xs font-medium text-muted-foreground border-t border-border hover:bg-muted/40 transition-colors"
        >
          <span>
            {expanded
              ? t("showLess")
              : t("showAll", { count: items.length })}
          </span>
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 transition-transform duration-200",
              expanded && "rotate-180"
            )}
          />
        </button>
      )}
    </>
  );
}
