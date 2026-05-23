"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip } from "@tomomai/ui";
import { useTranslations } from "next-intl";

interface RatingClimbChartProps {
  data: {
    band: number;
    users: number;
    avgRatingPer30d: number;
    avgPlaysPer30d: number;
  }[];
}

function formatBand(band: number) {
  const k = band / 1000;
  return Number.isInteger(k) ? `${k}k` : `${k.toFixed(1)}k`;
}

export function RatingClimbChart({ data }: RatingClimbChartProps) {
  const t = useTranslations("db.stats");

  const chartConfig = {
    avgRatingPer30d: { label: t("yAxis.ratingPer30d"), color: "var(--primary)" },
  };

  return (
    <ChartContainer config={chartConfig} className="h-[300px] w-full">
      <BarChart data={data}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="band"
          tickLine={false}
          axisLine={false}
          interval={0}
          tick={{ fontSize: 11 }}
          tickFormatter={(v) => formatBand(v as number)}
          label={{ value: t("xAxis.currentRatingBand"), position: "insideBottom", offset: -5 }}
        />
        <YAxis tickLine={false} axisLine={false} />
        <ChartTooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const row = payload[0].payload as RatingClimbChartProps["data"][number];
            return (
              <div className="rounded-lg border bg-background p-2 shadow-sm">
                <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                  <span className="font-medium">{t("xAxis.currentRatingBand")}:</span>
                  <span className="font-mono">{formatBand(row.band)}–{formatBand(row.band + 500)}</span>
                  <span className="font-medium">{t("yAxis.ratingPer30d")}:</span>
                  <span className="font-mono">+{row.avgRatingPer30d.toFixed(1)}</span>
                  <span className="font-medium">{t("yAxis.playsPer30d")}:</span>
                  <span className="font-mono">+{row.avgPlaysPer30d.toFixed(1)}</span>
                  <span className="font-medium">{t("yAxis.count")}:</span>
                  <span className="font-mono">{row.users}</span>
                </div>
              </div>
            );
          }}
        />
        <Bar dataKey="avgRatingPer30d" fill="var(--color-avgRatingPer30d)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}
