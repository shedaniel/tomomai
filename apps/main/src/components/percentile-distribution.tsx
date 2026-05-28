"use client";

import { Separator } from "@tomomai/ui";
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";
import type { PercentileDistributionData } from "@/lib/percentile-types";

// achievement ×10000 thresholds for grade boundaries
const TIER_BANDS = [
  { x1: 0, x2: 970000, fill: "#94a3b8" }, // < 97%
  { x1: 970000, x2: 980000, fill: "#f59e0b" }, // S
  { x1: 980000, x2: 990000, fill: "#38bdf8" }, // S+
  { x1: 990000, x2: 1000000, fill: "#facc15" }, // SS / SS+
  { x1: 1000000, x2: 1005000, fill: "#4ade80" }, // SSS
  { x1: 1005000, x2: 1100000, fill: "#c084fc" }, // SSS+
] as const;

const TIER_TICKS = [970000, 980000, 990000, 1000000, 1005000, 1010000];
const TIER_TICK_LABELS: Record<number, string> = {
  970000: "97%",
  980000: "98%",
  990000: "99%",
  1000000: "100%",
  1005000: "100.5%",
  1010000: "101%",
};

/** Compute horizontal gradient stops with sharp transitions at tier boundaries. */
function buildTierGradient(minLo: number, maxLo: number) {
  const range = maxLo - minLo;
  const stops: { offset: string; color: string }[] = [];
  for (const band of TIER_BANDS) {
    const s = range > 0 ? (band.x1 - minLo) / range : 0;
    const e = range > 0 ? (band.x2 - minLo) / range : 1;
    if (e <= 0 || s >= 1) continue;
    const cs = Math.max(0, s);
    const ce = Math.min(1, e);
    stops.push({ offset: `${(cs * 100).toFixed(2)}%`, color: band.fill });
    stops.push({ offset: `${(ce * 100).toFixed(2)}%`, color: band.fill });
  }
  if (!stops.length) {
    const color = (TIER_BANDS.find(b => minLo >= b.x1 && minLo < b.x2) ?? TIER_BANDS[0]).fill;
    return [{ offset: "0%", color }, { offset: "100%", color }];
  }
  return stops;
}

interface PercentileDistributionProps {
  data: PercentileDistributionData;
  /** Render a top divider before the chart. Defaults to true (for hover-card layouts). */
  withSeparator?: boolean;
  /** Unique gradient id so multiple instances on the same page don't collide. */
  gradientId?: string;
}

export function PercentileDistribution({
  data,
  withSeparator = true,
  gradientId = "tierGrad",
}: PercentileDistributionProps) {
  const pct = data.percentile;
  let labelText: string;
  let labelColor: string;
  if (pct >= 0.6) {
    const topPct = Math.round((1 - pct) * 100);
    labelText = `Top ${topPct}%`;
    labelColor = topPct <= 10 ? "text-yellow-500" : "text-green-500";
  } else if (pct >= 0.4) {
    labelText = "About Average";
    labelColor = "text-muted-foreground";
  } else {
    labelText = `Bottom ${Math.round(pct * 100)}%`;
    labelColor = "text-red-400";
  }

  const dist = data.distribution;
  const minLo = dist[0]?.lo ?? data.userAchievement;
  const maxLo = dist[dist.length - 1]?.lo ?? data.userAchievement;
  const clampedX = Math.max(minLo, Math.min(maxLo, data.userAchievement));
  // Extend to the nearest tier tick <= minLo and always to 101% on the right.
  const leftEdge = Math.max(940000, Math.min(970000, minLo));
  const rightEdge = 1010000;

  // "dataMin"/"dataMax" domain detection produces the correct axis extent.
  const paddedDist: { lo: number; count: number }[] = [
    { lo: leftEdge, count: 0 },
    { lo: Math.max(leftEdge, minLo - 2000), count: 0 },
    ...dist.filter(d => d.lo >= leftEdge && d.lo <= rightEdge),
    { lo: Math.min(rightEdge, maxLo + 2000), count: 0 },
    { lo: rightEdge, count: 0 },
  ];

  const tierStops = buildTierGradient(leftEdge, rightEdge);

  return (
    <>
      {withSeparator && <Separator />}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Among peers</span>
          <span className={cn("font-semibold tabular-nums", labelColor)}>
            {labelText}
          </span>
        </div>
        <div className="w-full h-30 -mx-0.5">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={paddedDist} margin={{ top: 4, right: 2, left: 2, bottom: 8 }}>
              <defs>
                <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
                  {tierStops.map((s, i) => (
                    <stop key={i} offset={s.offset} stopColor={s.color} />
                  ))}
                </linearGradient>
              </defs>
              <XAxis
                dataKey="lo"
                type="number"
                domain={["dataMin", "dataMax"]}
                ticks={TIER_TICKS.filter(t => t > leftEdge)}
                interval={0}
                tick={({ x, y, payload }: any) => (
                  <g transform={`translate(${x},${y})`}>
                    <text
                      x={0} y={0} dy={4}
                      textAnchor="end"
                      transform="rotate(-40)"
                      style={{ fill: "var(--muted-foreground)", fontSize: 8 }}
                    >
                      {TIER_TICK_LABELS[payload.value as number] ?? ""}
                    </text>
                  </g>
                )}
                axisLine={false}
                tickLine={false}
                height={20}
              />
              <YAxis hide />
              <Area
                type="monotone"
                dataKey="count"
                stroke={`url(#${gradientId})`}
                strokeWidth={1.5}
                fill={`url(#${gradientId})`}
                fillOpacity={0.25}
                dot={false}
                isAnimationActive={false}
              />
              <ReferenceLine
                x={clampedX}
                stroke={`var(--color-${labelColor.replace('text-', '')})`}
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <p className="text-[10px] text-muted-foreground text-right">
          out of {data.peerCount} similarly rated players
        </p>
      </div>
    </>
  );
}
