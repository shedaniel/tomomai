"use client";

import { Bar, BarChart, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { ChartContainer, ChartTooltip } from "@tomomai/ui";
import { useTranslations } from "next-intl";

interface AverageAchievementChartProps {
  data: { level: string; averageAchievement: number }[];
}

export function AverageAchievementChart({ data }: AverageAchievementChartProps) {
  const t = useTranslations("db.stats");

  const chartConfig = {
    averageAchievement: {
      label: t("yAxis.achievement"),
      color: "var(--primary)",
    },
  };

  return (
    <ChartContainer config={chartConfig} className="h-[300px] w-full">
      <BarChart data={data}>
        <XAxis
          dataKey="level"
          tickLine={false}
          axisLine={false}
          label={{ value: t("xAxis.level"), position: "insideBottom", offset: -5 }}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          domain={[70, 101]}
          tickFormatter={(value) => `${value.toFixed(0)}%`}
        />
        <ChartTooltip
          content={({ active, payload }) => {
            if (active && payload && payload.length) {
              return (
                <div className="rounded-lg border bg-background p-2 shadow-sm">
                  <div className="grid grid-cols-2 gap-2">
                    <span className="font-medium">{t("xAxis.level")}:</span>
                    <span className="font-mono">{payload[0].payload.level}</span>
                    <span className="font-medium">{t("yAxis.achievement")}:</span>
                    <span className="font-mono">
                      {(payload[0].value as number).toFixed(4)}%
                    </span>
                  </div>
                </div>
              );
            }
            return null;
          }}
        />
        <Bar
          dataKey={(data) => data.averageAchievement / 10000}
          name="averageAchievement"
          fill="var(--color-averageAchievement)"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ChartContainer>
  );
}
