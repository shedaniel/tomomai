"use client";

import { Line, LineChart, XAxis, YAxis, CartesianGrid } from "recharts";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { useTranslations } from "next-intl";

interface FetchesPerDayChartProps {
  data: { date: string; count: number }[];
}

export function FetchesPerDayChart({ data }: FetchesPerDayChartProps) {
  const t = useTranslations("db.stats");

  const chartConfig = {
    count: {
      label: t("yAxis.usersWithFetches"),
      color: "hsl(var(--primary))",
    },
  };

  return (
    <ChartContainer config={chartConfig} className="h-[300px] w-full">
      <LineChart data={data}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => {
            const date = new Date(value + "T00:00:00");
            return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
          }}
          label={{ value: t("xAxis.date"), position: "insideBottom", offset: -5 }}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => `${value}`}
        />
        <ChartTooltip
          content={({ active, payload }) => {
            if (active && payload && payload.length) {
              const date = new Date(payload[0].payload.date + "T00:00:00");
              return (
                <div className="rounded-lg border bg-background p-2 shadow-sm">
                  <div className="grid grid-cols-2 gap-2">
                    <span className="font-medium">{t("xAxis.date")}:</span>
                    <span className="font-mono">
                      {date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                    </span>
                    <span className="font-medium">{t("yAxis.usersWithFetches")}:</span>
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
