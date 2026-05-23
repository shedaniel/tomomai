"use client";

import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, Cell } from "recharts";
import { ChartContainer, ChartTooltip } from "@tomomai/ui";
import { useTranslations } from "next-intl";

interface RatingVsPlayCountHeatmapProps {
  data: { ratingBucket: number; playCountBucket: number; count: number }[];
}

export function RatingVsPlayCountHeatmap({ data }: RatingVsPlayCountHeatmapProps) {
  const t = useTranslations("db.stats");

  const chartConfig = {
    count: {
      label: t("yAxis.count"),
      color: "var(--primary)",
    },
  };

  return (
    <ChartContainer config={chartConfig} className="h-[300px] w-full">
      <ScatterChart>
        <XAxis
          type="number"
          dataKey="playCountBucket"
          name="playCount"
          unit=""
          label={{ value: t("xAxis.playCount"), position: "insideBottom", offset: -5 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          type="number"
          dataKey="ratingBucket"
          name="rating"
          unit=""
          label={{ value: t("xAxis.rating"), angle: -90, position: "insideLeft" }}
          tickLine={false}
          axisLine={false}
        />
        <ZAxis type="number" dataKey="count" range={[50, 400]} name="users" />
        <ChartTooltip
          cursor={{ strokeDasharray: "3 3" }}
          content={({ active, payload }) => {
            if (active && payload && payload.length) {
              const data = payload[0].payload;
              return (
                <div className="rounded-lg border bg-background p-2 shadow-sm">
                  <div className="grid grid-cols-2 gap-2">
                    <span className="font-medium">{t("xAxis.rating")}:</span>
                    <span className="font-mono">{data.ratingBucket}</span>
                    <span className="font-medium">{t("xAxis.playCount")}:</span>
                    <span className="font-mono">{data.playCountBucket}</span>
                    <span className="font-medium">{t("table.count")}:</span>
                    <span className="font-mono">{data.count}</span>
                  </div>
                </div>
              );
            }
            return null;
          }}
        />
        <Scatter data={data} fill="var(--color-count)">
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fillOpacity={0.6} />
          ))}
        </Scatter>
      </ScatterChart>
    </ChartContainer>
  );
}
