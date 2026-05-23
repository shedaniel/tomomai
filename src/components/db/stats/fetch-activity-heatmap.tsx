"use client";

import { useTranslations } from "next-intl";
import { useMemo } from "react";

interface FetchActivityHeatmapProps {
  data: { dow: number; hour: number; count: number }[];
}

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export function FetchActivityHeatmap({ data }: FetchActivityHeatmapProps) {
  const tDays = useTranslations("common.weekdays");

  const { grid, max } = useMemo(() => {
    const grid = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
    let max = 0;
    for (const { dow, hour, count } of data) {
      if (dow < 0 || dow > 6 || hour < 0 || hour > 23) continue;
      grid[dow][hour] = count;
      if (count > max) max = count;
    }
    return { grid, max };
  }, [data]);

  return (
    <div className="overflow-x-auto">
      <div className="inline-grid gap-[2px]" style={{ gridTemplateColumns: "auto repeat(24, minmax(14px, 1fr))" }}>
          <div />
          {Array.from({ length: 24 }, (_, h) => (
            <div key={`h-${h}`} className="text-[10px] text-muted-foreground text-center">
              {h % 3 === 0 ? h : ""}
            </div>
          ))}
          {DAYS.map((day, dow) => (
            <div key={`row-${day}`} className="contents">
              <div className="pr-2 text-[10px] text-muted-foreground self-center">
                {tDays(day)}
              </div>
              {Array.from({ length: 24 }, (_, h) => {
                const v = grid[dow][h];
                const intensity = max > 0 ? v / max : 0;
                return (
                  <div
                    key={`c-${dow}-${h}`}
                    className="aspect-square rounded-sm bg-primary"
                    style={{ opacity: v === 0 ? 0.08 : 0.15 + intensity * 0.85 }}
                    title={`${tDays(day)} ${String(h).padStart(2, "0")}:00 — ${v}`}
                  />
                );
              })}
            </div>
          ))}
      </div>
    </div>
  );
}
