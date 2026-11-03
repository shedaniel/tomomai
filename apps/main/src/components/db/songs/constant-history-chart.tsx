"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useGame } from "@/components/providers/game-provider";
import { codeOf } from "@/lib/games/codes";
import { getGameDifficulty } from "@/lib/games/presentation";
import { getVersion } from "@/lib/games/versions";
import type { SongDetails } from "./types";

const ROW = 60;
const LABEL_WIDTH = 92;
const EDGE = 28;
const AXIS = 22;
// levelPrecise is stored ×10, so this is one whole level.
const MIN_SPAN = 10;
// Version labels are drawn at 10px; this is roughly a character's width there.
const CHAR_WIDTH = 6;

/** Version names without the words every one of them starts with, such as the game's name. */
function shortNames(names: readonly string[]): string[] {
  const words = names.map(name => name.split(" "));
  let shared = 0;
  while (words.every(parts => parts.length > shared + 1 && parts[shared] === words[0][shared])) shared++;
  return words.map(parts => parts.slice(shared).join(" "));
}

type Versions = SongDetails["regions"][number]["versions"];

/**
 * Each chart's constant across the versions of one region, one row per difficulty. Rows scale on their own, since
 * a 0.2 change on a 14 would vanish on an axis shared with a 7, but over at least a whole level so a 0.1 nudge
 * does not fill the row.
 */
export function ConstantHistoryChart({ versions, label }: { versions: Versions; label: string }) {
  const game = useGame().id;
  const titleId = useId();
  const [hover, setHover] = useState<{ series: number; point: number } | null>(null);
  // Laid out at its real width, so its labels keep their size on a phone.
  const frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(560);
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.round(entry.contentRect.width))));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

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
      .map(([difficulty, points]) => {
        const levels = points.map(point => point.levelPrecise);
        const code = codeOf(game, "difficulty", difficulty);
        return { code, presentation: getGameDifficulty(game, code), points, min: Math.min(...levels), max: Math.max(...levels) };
      })
      .sort((a, b) => a.code - b.code);
    if (series.length === 0) return null;
    const left = LABEL_WIDTH;
    const right = width - EDGE;
    const x = (index: number) => left + index / Math.max(ordered.length - 1, 1) * (right - left);
    const y = (row: number, level: number) => {
      const { min, max } = series[row];
      const span = Math.max(max - min, MIN_SPAN);
      const floor = (min + max) / 2 - span / 2;
      return row * ROW + 20 + (1 - (level - floor) / span) * (ROW - 30);
    };
    const names = shortNames(ordered.map(version => getVersion(game, version.gameVersion)?.name ?? `v${version.gameVersion}`));
    // Every version gets a tick; names are skipped evenly when the columns are too narrow for all of them.
    const column = ordered.length > 1 ? (right - left) / (ordered.length - 1) : Infinity;
    const step = Math.max(1, Math.ceil((Math.max(...names.map(name => name.length)) * CHAR_WIDTH + 8) / column));
    const shown = new Set(names.map((_, index) => index).filter(index => index % step === 0));
    const lastIndex = ordered.length - 1;
    if (!shown.has(lastIndex)) {
      shown.delete(lastIndex - (lastIndex % step));
      shown.add(lastIndex);
      shown.add(0);
    }
    const rowsHeight = series.length * ROW;
    return { ordered, series, x, y, left, right, names, shown, rowsHeight, height: rowsHeight + AXIS };
  }, [versions, game, width]);

  if (!chart) return null;
  const versionName = (index: number) => getVersion(game, chart.ordered[index].gameVersion)?.name ?? `v${chart.ordered[index].gameVersion}`;
  const level = (value: number) => (value / 10).toFixed(1);
  const active = hover && chart.series[hover.series].points[hover.point];

  return (
    <figure className="space-y-2" aria-labelledby={titleId}>
      <figcaption id={titleId} className="text-xs font-medium">{label}</figcaption>
      <div ref={frame} className="relative">
        <svg viewBox={`0 0 ${width} ${chart.height}`} className="h-auto w-full overflow-visible" aria-hidden onPointerLeave={() => setHover(null)}>
          {chart.ordered.map((_, index) => (
            <line key={index} x1={chart.x(index)} x2={chart.x(index)} y1={4} y2={chart.rowsHeight} className="stroke-border" strokeWidth={1} strokeDasharray="1 3" />
          ))}
          {chart.series.map(({ presentation, points }, row) => {
            return (
              <g key={presentation.label}>
                {row > 0 && <line x1={0} x2={width} y1={row * ROW} y2={row * ROW} className="stroke-border" strokeWidth={1} strokeDasharray="2 3" />}
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
                {points.map((point, pointIndex) => {
                  const latest = pointIndex === points.length - 1;
                  if (pointIndex > 0 && point.levelPrecise === points[pointIndex - 1].levelPrecise && !latest) return null;
                  return (
                    <text
                      key={point.index}
                      x={chart.x(point.index)}
                      y={chart.y(row, point.levelPrecise) - 9}
                      textAnchor="middle"
                      className={latest ? "fill-foreground text-[11px] font-semibold tabular-nums" : "fill-muted-foreground text-[10px] tabular-nums"}
                    >
                      {level(point.levelPrecise)}
                    </text>
                  );
                })}
              </g>
            );
          })}
          {chart.names.map((name, index) => {
            if (!chart.shown.has(index)) return null;
            const half = name.length * CHAR_WIDTH / 2;
            const anchor = chart.x(index) + half > width ? "end" : "middle";
            return (
              <text key={index} x={anchor === "end" ? width : chart.x(index)} y={chart.height - 6} textAnchor={anchor} className="fill-muted-foreground text-[10px]">
                {name}
              </text>
            );
          })}
        </svg>
        {hover && active && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border bg-popover px-2 py-1 text-xs shadow-md"
            style={{ left: `${chart.x(active.index) / width * 100}%`, top: `${(chart.y(hover.series, active.levelPrecise) - 8) / chart.height * 100}%` }}
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
