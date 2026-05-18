"use client";

import { Area, AreaChart, XAxis, YAxis, CartesianGrid } from "recharts";
import { ChartContainer, ChartTooltip } from "@tomomai/ui";
import { useTranslations } from "next-intl";
import { useMemo } from "react";

interface RatingDistributionChartProps {
  data: { bucket: number; percentage: number }[];
}

export function RatingDistributionChart({ data }: RatingDistributionChartProps) {
  const t = useTranslations("db.stats");

  const chartConfig = {
    percentage: {
      label: t("yAxis.percentage"),
      color: "hsl(var(--primary))",
    },
  };

  const domain = useMemo(() => {
    if (data.length === 0) return [0, 0];
    const buckets = data.map(d => d.bucket);
    return [Math.min(...buckets), Math.max(...buckets)];
  }, [data]);

  return (
    <ChartContainer config={chartConfig} className="h-[300px] w-full">
      <AreaChart data={data}>
        <defs>
          <linearGradient id="fillPercentage" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-percentage)" stopOpacity={0.8} />
            <stop offset="95%" stopColor="var(--color-percentage)" stopOpacity={0.1} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="bucket"
          type="number"
          domain={domain}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => `${value}`}
          label={{ value: t("xAxis.rating"), position: "insideBottom", offset: -5 }}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => `${(value * 100).toFixed(0)}%`}
        />
        <ChartTooltip
          content={({ active, payload }) => {
            if (active && payload && payload.length) {
              return (
                <div className="rounded-lg border bg-background p-2 shadow-sm">
                  <div className="grid grid-cols-2 gap-2">
                    <span className="font-medium">{t("xAxis.rating")}:</span>
                    <span className="font-mono">{payload[0].payload.bucket}</span>
                    <span className="font-medium">{t("yAxis.percentage")}:</span>
                    <span className="font-mono">
                      {(payload[0].value as number * 100).toFixed(2)}%
                    </span>
                  </div>
                </div>
              );
            }
            return null;
          }}
        />
        <Area
          dataKey="percentage"
          type="monotone"
          fill="url(#fillPercentage)"
          fillOpacity={0.4}
          stroke="var(--color-percentage)"
          strokeWidth={4}
        />
      </AreaChart>
    </ChartContainer>
  );
}
