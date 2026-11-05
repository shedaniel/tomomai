"use client";

import { useId, useMemo, useState } from "react";
import { useFormatter } from "next-intl";
import { useGame } from "@/components/providers/game-provider";
import { formatGameScore, getGameStatusLabels } from "@/lib/games/presentation";
import { edgeAnchor } from "@/lib/chart-tooltip";
import { cn } from "@/lib/utils";

export type ScoreHistoryPoint = { fetchedAt: Date; scoreValue: number; comboStatus: number; syncStatus: number; clearStatus: number };

const WIDTH = 320;
const HEIGHT = 120;
const PLOT = { left: 4, right: WIDTH - 4, top: 10, bottom: HEIGHT - 18 };

/** The viewer's best score on one chart over time, stepping up at each snapshot where it improved. */
export function ScoreHistoryChart({ points, label }: { points: readonly ScoreHistoryPoint[]; label: string }) {
  const game = useGame().id;
  const format = useFormatter();
  const titleId = useId();
  const [hover, setHover] = useState<number | null>(null);
  const [now] = useState(() => Date.now());

  const geometry = useMemo(() => {
    const start = points[0].fetchedAt.getTime();
    const end = Math.max(now, start + 1);
    const scores = points.map(point => point.scoreValue);
    const max = Math.max(...scores);
    const min = Math.min(...scores);
    const pad = Math.max((max - min) * 0.15, 1000);
    const x = (time: number) => PLOT.left + (time - start) / (end - start) * (PLOT.right - PLOT.left);
    const y = (score: number) => PLOT.bottom - (score - (min - pad)) / (max - (min - pad)) * (PLOT.bottom - PLOT.top);
    const marks = points.map(point => ({ point, cx: x(point.fetchedAt.getTime()), cy: y(point.scoreValue) }));
    const path = marks.map((mark, index) => index === 0 ? `M${mark.cx},${mark.cy}` : `H${mark.cx}V${mark.cy}`).join("") + `H${PLOT.right}`;
    return { marks, path, start, end };
  }, [points, now]);

  const active = hover === null ? null : geometry.marks[hover];
  const date = (value: Date) => format.dateTime(value, { year: "numeric", month: "short", day: "numeric" });

  return (
    <figure className="relative" aria-labelledby={titleId}>
      <figcaption id={titleId} className="sr-only">{label}</figcaption>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-auto w-full overflow-visible text-primary"
        role="img"
        aria-hidden
        onPointerLeave={() => setHover(null)}
        onPointerMove={event => {
          const box = event.currentTarget.getBoundingClientRect();
          const px = (event.clientX - box.left) / box.width * WIDTH;
          let nearest = 0;
          geometry.marks.forEach((mark, index) => {
            if (Math.abs(mark.cx - px) < Math.abs(geometry.marks[nearest].cx - px)) nearest = index;
          });
          setHover(nearest);
        }}
      >
        <line x1={PLOT.left} x2={PLOT.right} y1={PLOT.bottom} y2={PLOT.bottom} className="stroke-border" strokeWidth={1} />
        <path d={geometry.path} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" />
        {active && <line x1={active.cx} x2={active.cx} y1={PLOT.top} y2={PLOT.bottom} className="stroke-muted-foreground/40" strokeWidth={1} />}
        {geometry.marks.map((mark, index) => (
          <circle key={index} cx={mark.cx} cy={mark.cy} r={index === hover ? 5 : 4} fill="currentColor" className="stroke-background" strokeWidth={2} />
        ))}
        <text x={PLOT.left} y={HEIGHT - 4} className="fill-muted-foreground text-[10px]">{date(new Date(geometry.start))}</text>
        <text x={PLOT.right} y={HEIGHT - 4} textAnchor="end" className="fill-muted-foreground text-[10px]">{date(new Date(geometry.end))}</text>
      </svg>
      {active && (
        <div
          className={cn("pointer-events-none absolute top-0 z-10 rounded-md border bg-popover px-2 py-1 text-xs whitespace-nowrap shadow-md", edgeAnchor(active.cx / WIDTH))}
          style={{ left: `${active.cx / WIDTH * 100}%` }}
        >
          <div className="text-muted-foreground">{date(active.point.fetchedAt)}</div>
          <div className="font-semibold tabular-nums">
            {formatGameScore(game, active.point.scoreValue)} {getGameStatusLabels(game, active.point).join(" ")}
          </div>
        </div>
      )}
      <ol className="sr-only">
        {points.map((point, index) => <li key={index}>{date(point.fetchedAt)}: {formatGameScore(game, point.scoreValue)}</li>)}
      </ol>
    </figure>
  );
}
