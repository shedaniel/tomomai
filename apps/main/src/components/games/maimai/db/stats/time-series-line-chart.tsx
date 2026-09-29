"use client";

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip } from "@tomomai/ui";

interface TimeSeriesLineChartProps<T extends Record<string, unknown>> {
  data: T[];
  xKey: keyof T & string;
  yKey: keyof T & string;
  xLabel: string;
  yLabel: string;
  formatXAxis: (v: T[keyof T]) => string;
  formatXTooltip?: (v: T[keyof T]) => string;
  tooltipXLabel?: string;
}

export function TimeSeriesLineChart<T extends Record<string, unknown>>({
  data,
  xKey,
  yKey,
  xLabel,
  yLabel,
  formatXAxis,
  formatXTooltip,
  tooltipXLabel,
}: TimeSeriesLineChartProps<T>) {
  const chartConfig = {
    [yKey]: { label: yLabel, color: "var(--primary)" },
  };
  const formatTooltip = formatXTooltip ?? formatXAxis;
  const tooltipLabel = tooltipXLabel ?? xLabel;

  return (
    <ChartContainer config={chartConfig} className="h-[300px] w-full">
      <LineChart data={data}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey={xKey}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => formatXAxis(v as T[keyof T])}
          label={{ value: xLabel, position: "insideBottom", offset: -5 }}
        />
        <YAxis tickLine={false} axisLine={false} />
        <ChartTooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const row = payload[0].payload as T;
            return (
              <div className="rounded-lg border bg-background p-2 shadow-sm">
                <div className="grid grid-cols-2 gap-2">
                  <span className="font-medium">{tooltipLabel}:</span>
                  <span className="font-mono">{formatTooltip(row[xKey])}</span>
                  <span className="font-medium">{yLabel}:</span>
                  <span className="font-mono">{payload[0].value as number}</span>
                </div>
              </div>
            );
          }}
        />
        <Line
          dataKey={yKey}
          type="monotone"
          stroke={`var(--color-${yKey})`}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 5, fill: `var(--color-${yKey})` }}
        />
      </LineChart>
    </ChartContainer>
  );
}
