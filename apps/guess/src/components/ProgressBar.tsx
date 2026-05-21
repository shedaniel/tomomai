"use client";

import { cn } from "@tomomai/ui/utils";
import type { StepResult } from "@/lib/progress";

type Props = {
  /** One entry per hint already acted on. */
  results: readonly StepResult[];
  /** Total number of hints the player can act on this game (= HINT_COUNT). */
  total: number;
};

/**
 * Row of small pill segments — one per hint slot. Acted-on slots are coloured
 * by outcome (green/red/gray-skipped); future slots stay muted.
 */
export function ProgressBar({ results, total }: Props) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: total }, (_, i) => {
        const r = results[i];
        return (
          <div
            key={i}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors",
              r === "correct" && "bg-emerald-500",
              r === "incorrect" && "bg-rose-500",
              r === "skipped" && "bg-muted-foreground/50",
              !r && "bg-muted-foreground/20",
            )}
            aria-label={
              r === "correct"
                ? "correct"
                : r === "incorrect"
                  ? "incorrect"
                  : r === "skipped"
                    ? "skipped"
                    : "pending"
            }
          />
        );
      })}
    </div>
  );
}
