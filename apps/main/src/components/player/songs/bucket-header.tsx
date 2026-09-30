"use client";

import { Plus, TrendingUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { useGame, usePresentation } from "@/components/providers/game-provider";
import { formatGameRating } from "@/lib/games/presentation";
import { cn } from "@/lib/utils";

/** A song section's title and count, followed by its rating summary when `ratings` is given. */
export function BucketHeader({ title, count, ratings, className }: {
  title: string;
  count?: string;
  ratings?: readonly number[];
  className?: string;
}) {
  const t = useTranslations();
  const game = useGame().id;
  const { aggregation } = usePresentation().ratingRules;
  const sum = ratings?.reduce((total, rating) => total + rating, 0) ?? 0;

  return (
    <div className={cn("flex justify-between items-center", className)}>
      <h5 className="font-semibold text-sm">{title} {count && `(${count})`}</h5>
      {ratings && (
        <div className="flex gap-4 text-xs text-muted-foreground">
          {aggregation === "sum" && (
            <div className="flex items-center gap-1 whitespace-nowrap">
              <Plus className="h-3 w-3" />
              <span>{t("dataContent.statistics.sum")}</span>
              <span className="font-mono font-medium">{formatGameRating(game, sum)}</span>
            </div>
          )}
          <div className="flex items-center gap-1 whitespace-nowrap">
            <TrendingUp className="h-3 w-3" />
            <span>{t("dataContent.statistics.average")}</span>
            <span className="font-mono font-medium">{formatGameRating(game, ratings.length > 0 ? sum / ratings.length : 0, { average: true })}</span>
          </div>
        </div>
      )}
    </div>
  );
}
