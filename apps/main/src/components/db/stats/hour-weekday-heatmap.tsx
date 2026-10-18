"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

interface HourWeekdayHeatmapProps {
  data: { dow: number; hour: number; count: number }[];
}

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export function HourWeekdayHeatmap({ data }: HourWeekdayHeatmapProps) {
  const tDays = useTranslations("common.weekdays");
  const t = useTranslations("db.stats");
  const format = useFormatter();
  const [active, setActive] = useState<{ dow: number; hour: number } | null>(null);

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

  const peak = useMemo(() => {
    let best: { dow: number; hour: number } | null = null;
    grid.forEach((row, dow) => row.forEach((count, hour) => {
      if (count > 0 && (!best || count > grid[best.dow][best.hour])) best = { dow, hour };
    }));
    return best as { dow: number; hour: number } | null;
  }, [grid]);

  const slot = ({ dow, hour }: { dow: number; hour: number }) => ({
    slot: `${tDays(DAYS[dow])} ${String(hour).padStart(2, "0")}:00`,
    count: format.number(grid[dow][hour]),
  });
  // Hovering (or tapping on touch) shows a cell; otherwise the busiest slot is summarised
  const readout = active ? t("heatmapCell", slot(active)) : peak ? t("heatmapPeak", slot(peak)) : null;

  return (
    <div className="overflow-x-auto">
      <p className="mb-2 h-4 text-xs text-muted-foreground tabular-nums" aria-live="polite">{readout}</p>
      <div
        className="inline-grid gap-[2px]"
        style={{ gridTemplateColumns: "auto repeat(24, minmax(14px, 1fr))" }}
        onPointerLeave={(event) => { if (event.pointerType === "mouse") setActive(null); }}
      >
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
                // Power scaling (gamma > 1) compresses low values and lets peaks pop brighter.
                const intensity = max > 0 ? Math.pow(v / max, 3) : 0;
                return (
                  <div
                    key={`c-${dow}-${h}`}
                    className={cn(
                      "aspect-square rounded-sm transition-shadow",
                      active?.dow === dow && active.hour === h && "ring-2 ring-foreground",
                    )}
                    onPointerEnter={(event) => { if (event.pointerType === "mouse") setActive({ dow, hour: h }); }}
                    onClick={() => setActive(current => current?.dow === dow && current.hour === h ? null : { dow, hour: h })}
                  >
                    {/* Opacity encodes the count, so it lives on an inner layer to keep the highlight ring solid */}
                    <div className="h-full w-full rounded-sm bg-primary" style={{ opacity: v === 0 ? 0.08 : 0.15 + intensity * 0.85 }} />
                  </div>
                );
              })}
            </div>
          ))}
      </div>
    </div>
  );
}
