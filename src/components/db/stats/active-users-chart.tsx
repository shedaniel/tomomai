"use client";

import { Line, LineChart, XAxis, YAxis, CartesianGrid } from "recharts";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { useTranslations } from "next-intl";
import { useMemo } from "react";

interface ActiveUsersChartProps {
  data: { days: number; count: number }[];
}

export function ActiveUsersChart({ data }: ActiveUsersChartProps) {
  const t = useTranslations("db.stats");

  const chartConfig = {
    count: {
      label: t("yAxis.activeUsers"),
      color: "hsl(var(--primary))",
    },
  };

  const formattedData = useMemo(() => {
    return data.map(item => ({
      ...item,
      displayDays: item.days === 1 ? t("xAxis.lastDay") : t("xAxis.lastDays", { days: item.days }),
    }));
  }, [data, t]);

  return (
    <ChartContainer config={chartConfig} className="h-[300px] w-full">
      <LineChart data={formattedData}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="days"
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => value}
          label={{ value: t("xAxis.days"), position: "insideBottom", offset: -5 }}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => `${value}`}
        />
        <ChartTooltip
          content={({ active, payload }) => {
            if (active && payload && payload.length) {
              return (
                <div className="rounded-lg border bg-background p-2 shadow-sm">
                  <div className="grid grid-cols-2 gap-2">
                    <span className="font-medium">{t("xAxis.timePeriod")}:</span>
                    <span className="font-mono">{payload[0].payload.displayDays}</span>
                    <span className="font-medium">{t("yAxis.activeUsers")}:</span>
                    <span className="font-mono">
                      {payload[0].value as number}
                    </span>
                  </div>
                </div>
              );
            }
            return null;
          }}
        />
        <Line
          dataKey="count"
          type="monotone"
          stroke="var(--color-count)"
          strokeWidth={2}
          dot={{ fill: "var(--color-count)", strokeWidth: 2, r: 4 }}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ChartContainer>
  );
}
