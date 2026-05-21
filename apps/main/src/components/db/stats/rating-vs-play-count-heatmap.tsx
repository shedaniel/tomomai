"use client";

import { Cell, Scatter, ScatterChart, XAxis, YAxis, ZAxis } from "recharts";
import { ChartContainer, ChartTooltip } from "@tomomai/ui";
import { useTranslations } from "next-intl";
import { useMemo } from "react";

interface RatingVsPlayCountHeatmapProps {
  data: { ratingBucket: number; playCountBucket: number; count: number }[];
}

export function RatingVsPlayCountHeatmap({ data }: RatingVsPlayCountHeatmapProps) {
  const t = useTranslations("db.stats");

  const chartConfig = {
    count: { label: t("yAxis.count"), color: "var(--primary)" },
  };

  // X axis is log-scaled and requires strictly positive playCount; drop zero buckets.
  const points = useMemo(
    () => data.filter((d) => d.playCountBucket > 0),
    [data]
  );

  return (
    <ChartContainer config={chartConfig} className="h-[300px] w-full">
      <ScatterChart margin={{ top: 8, right: 12, bottom: 16, left: 4 }}>
        <XAxis
          type="number"
          dataKey="playCountBucket"
          scale="log"
          domain={["auto", "auto"]}
          allowDataOverflow
          ticks={[100, 1000, 10000]}
          tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : String(v))}
          label={{ value: t("xAxis.playCount"), position: "insideBottom", offset: -5 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          type="number"
          dataKey="ratingBucket"
          tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : String(v))}
          label={{ value: t("xAxis.rating"), angle: -90, position: "insideLeft" }}
          tickLine={false}
          axisLine={false}
        />
        <ZAxis type="number" dataKey="count" range={[50, 400]} name="users" />
        <ChartTooltip
          cursor={{ strokeDasharray: "3 3" }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const row = payload[0].payload as RatingVsPlayCountHeatmapProps["data"][number];
            return (
              <div className="rounded-lg border bg-background p-2 shadow-sm">
                <div className="grid grid-cols-2 gap-2">
                  <span className="font-medium">{t("xAxis.rating")}:</span>
                  <span className="font-mono">{row.ratingBucket}</span>
                  <span className="font-medium">{t("xAxis.playCount")}:</span>
                  <span className="font-mono">{row.playCountBucket}</span>
                  <span className="font-medium">{t("table.count")}:</span>
                  <span className="font-mono">{row.count}</span>
                </div>
              </div>
            );
          }}
        />
        <Scatter data={points} fill="var(--color-count)">
          {points.map((_, i) => (
            <Cell key={`cell-${i}`} fillOpacity={0.6} />
          ))}
        </Scatter>
      </ScatterChart>
    </ChartContainer>
  );
}
