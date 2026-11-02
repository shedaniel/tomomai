"use client";

import { useId, useMemo, useState } from "react";
import { useGame } from "@/components/providers/game-provider";
import { codeOf } from "@/lib/games/codes";
import { getGameDifficulty } from "@/lib/games/presentation";
import { getVersion } from "@/lib/games/versions";
import type { SongDetails } from "./types";

const WIDTH = 560;
const ROW = 52;
const PLOT = { left: 92, right: WIDTH - 40 };

type Versions = SongDetails["regions"][number]["versions"];

/**
 * Each chart's constant across the versions of one region, one row per chart whose constant changed. Rows scale
 * on their own, since a 0.2 change on a 14 would vanish on an axis shared with a 7.
 */
export function ConstantHistoryChart({ versions, label }: { versions: Versions; label: string }) {
  const game = useGame().id;
  const titleId = useId();
  const [hover, setHover] = useState<{ series: number; point: number } | null>(null);

  const chart = useMemo(() => {
    const ordered = [...versions].sort((a, b) => a.gameVersion - b.gameVersion);
    const byDifficulty = new Map<string, { index: number; levelPrecise: number }[]>();
    ordered.forEach((version, index) => {
      for (const entry of version.charts) {
        if (entry.levelPrecise <= 0) continue;
        const points = byDifficulty.get(entry.difficulty) ?? [];
        points.push({ index, levelPrecise: entry.levelPrecise });
        byDifficulty.set(entry.difficulty, points);
      }
    });
    const series = [...byDifficulty.entries()]
      .filter(([, points]) => new Set(points.map(point => point.levelPrecise)).size > 1)
      .map(([difficulty, points]) => {
        const levels = points.map(point => point.levelPrecise);
        return { presentation: getGameDifficulty(game, codeOf(game, "difficulty", difficulty)), points, min: Math.min(...levels), max: Math.max(...levels) };
      })
      .sort((a, b) => b.max - a.max);
    if (series.length === 0) return null;
    const x = (index: number) => PLOT.left + index / Math.max(ordered.length - 1, 1) * (PLOT.right - PLOT.left);
    const y = (row: number, level: number) => {
      const { min, max } = series[row];
      return row * ROW + 10 + (1 - (level - min) / Math.max(max - min, 1)) * (ROW - 24);
    };
    return { ordered, series, x, y, height: series.length * ROW + 18 };
  }, [versions, game]);

  if (!chart) return null;
  const versionName = (index: number) => getVersion(game, chart.ordered[index].gameVersion)?.name ?? `v${chart.ordered[index].gameVersion}`;
  const level = (value: number) => (value / 10).toFixed(1);
  const active = hover && chart.series[hover.series].points[hover.point];

  return (
    <figure className="space-y-2" aria-labelledby={titleId}>
      <figcaption id={titleId} className="text-xs font-medium">{label}</figcaption>
      <div className="relative">
        <svg viewBox={`0 0 ${WIDTH} ${chart.height}`} className="h-auto w-full overflow-visible" aria-hidden onPointerLeave={() => setHover(null)}>
          {chart.series.map(({ presentation, points }, row) => {
            const first = points[0];
            const last = points[points.length - 1];
            return (
              <g key={presentation.label}>
                {row > 0 && <line x1={0} x2={WIDTH} y1={row * ROW} y2={row * ROW} className="stroke-border" strokeWidth={1} strokeDasharray="2 3" />}
                <circle cx={6} cy={row * ROW + ROW / 2 - 4} r={4} fill={presentation.hex} />
                <text x={16} y={row * ROW + ROW / 2} className="fill-foreground text-[11px] font-semibold">{presentation.label}</text>
                <path
                  d={points.map((point, index) => `${index ? "L" : "M"}${chart.x(point.index)},${chart.y(row, point.levelPrecise)}`).join("")}
                  fill="none"
                  stroke={presentation.hex}
                  strokeWidth={2}
                  strokeLinejoin="round"
                />
                {points.map((point, pointIndex) => (
                  <g key={point.index} onPointerEnter={() => setHover({ series: row, point: pointIndex })}>
                    <circle cx={chart.x(point.index)} cy={chart.y(row, point.levelPrecise)} r={14} fill="transparent" />
                    <circle cx={chart.x(point.index)} cy={chart.y(row, point.levelPrecise)} r={4} fill={presentation.hex} className="stroke-background" strokeWidth={2} />
                  </g>
                ))}
                <text x={chart.x(first.index)} y={chart.y(row, first.levelPrecise) + 16} textAnchor="middle" className="fill-muted-foreground text-[10px] tabular-nums">{level(first.levelPrecise)}</text>
                <text x={chart.x(last.index) + 10} y={chart.y(row, last.levelPrecise) + 4} className="fill-foreground text-[11px] font-semibold tabular-nums">{level(last.levelPrecise)}</text>
              </g>
            );
          })}
          <text x={PLOT.left} y={chart.height - 2} className="fill-muted-foreground text-[10px]">{versionName(0)}</text>
          <text x={PLOT.right} y={chart.height - 2} textAnchor="end" className="fill-muted-foreground text-[10px]">{versionName(chart.ordered.length - 1)}</text>
        </svg>
        {hover && active && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border bg-popover px-2 py-1 text-xs shadow-md"
            style={{ left: `${chart.x(active.index) / WIDTH * 100}%`, top: `${(chart.y(hover.series, active.levelPrecise) - 8) / chart.height * 100}%` }}
          >
            <div className="text-muted-foreground">{versionName(active.index)}</div>
            <div className="font-semibold tabular-nums">{chart.series[hover.series].presentation.label} {level(active.levelPrecise)}</div>
          </div>
        )}
      </div>
      <table className="sr-only">
        <tbody>
          {chart.series.flatMap(({ presentation, points }) => points.map(point => (
            <tr key={`${presentation.label}-${point.index}`}><td>{presentation.label}</td><td>{versionName(point.index)}</td><td>{level(point.levelPrecise)}</td></tr>
          )))}
        </tbody>
      </table>
    </figure>
  );
}
