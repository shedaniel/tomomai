"use client";

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip } from "@tomomai/ui";
import { useTranslations } from "next-intl";
import { useId, useMemo } from "react";

interface DistributionAreaChartProps {
  data: { bucket: number; percentage: number }[];
  xLabel: string;
}

export function DistributionAreaChart({ data, xLabel }: DistributionAreaChartProps) {
  const t = useTranslations("db.stats");
  const gradId = useId();

  const chartConfig = {
    percentage: { label: t("yAxis.percentage"), color: "var(--primary)" },
  };

  const domain = useMemo<[number, number]>(() => {
    if (data.length === 0) return [0, 0];
    const buckets = data.map((d) => d.bucket);
    return [Math.min(...buckets), Math.max(...buckets)];
  }, [data]);

  return (
    <ChartContainer config={chartConfig} className="h-[300px] w-full">
      <AreaChart data={data}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
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
          label={{ value: xLabel, position: "insideBottom", offset: -5 }}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
        />
        <ChartTooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const row = payload[0].payload as { bucket: number };
            const value = payload[0].value as number;
            return (
              <div className="rounded-lg border bg-background p-2 shadow-sm">
                <div className="grid grid-cols-2 gap-2">
                  <span className="font-medium">{xLabel}:</span>
                  <span className="font-mono">{row.bucket}</span>
                  <span className="font-medium">{t("yAxis.percentage")}:</span>
                  <span className="font-mono">{(value * 100).toFixed(2)}%</span>
                </div>
              </div>
            );
          }}
        />
        <Area
          dataKey="percentage"
          type="monotone"
          fill={`url(#${gradId})`}
          fillOpacity={0.4}
          stroke="var(--color-percentage)"
          strokeWidth={2}
        />
      </AreaChart>
    </ChartContainer>
  );
}
