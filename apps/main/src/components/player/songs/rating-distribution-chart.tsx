"use client";

import { useMemo } from "react";
import { Bar, BarChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@tomomai/ui";
import { useGame, usePresentation } from "@/components/providers/game-provider";
import { GAME_CODES } from "@/lib/games/codes";
import { formatGameRating, getGameDifficulty } from "@/lib/games/presentation";
import type { RatedScore } from "./types";

type DistributionScore = Pick<RatedScore, "difficultyCode" | "rating">;

/** How many charts of each difficulty fall into each rating range, with empty ranges kept. */
export function RatingDistributionChart({ scores, title }: { scores: readonly DistributionScore[]; title: string }) {
  const game = useGame().id;
  const step = usePresentation().ratingRules.distributionStep;
  const series = useMemo(
    () => GAME_CODES[game].difficulty.map((key, code) => ({ key, difficulty: getGameDifficulty(game, code) })),
    [game],
  );
  const config = useMemo(
    () => Object.fromEntries(series.map(({ key, difficulty }) => [key, { label: difficulty.label, color: difficulty.cssVar }])) satisfies ChartConfig,
    [series],
  );

  const data = useMemo(() => {
    if (scores.length === 0) return [];
    const ranges = scores.map(score => Math.floor(score.rating / step));
    const first = Math.min(...ranges);
    const counts = Array.from({ length: Math.max(...ranges) - first + 1 }, () => series.map(() => 0));
    scores.forEach((score, index) => {
      if (score.difficultyCode < series.length) counts[ranges[index] - first][score.difficultyCode]++;
    });
    return counts.map((row, index) => ({
      rating: formatGameRating(game, (first + index) * step),
      ...Object.fromEntries(series.map(({ key }, code) => [key, row[code]])),
    }));
  }, [game, scores, series, step]);

  if (scores.length === 0) return null;

  return (
    <div className="space-y-2 flex flex-col border border-border py-4 rounded-md">
      <span className="text-sm text-center font-semibold">{title}</span>
      <ChartContainer config={config} className="h-[200px] w-full pr-10">
        <BarChart data={data}>
          <XAxis dataKey="rating" tickLine={false} tickMargin={10} axisLine={false} tick={{ fontSize: 11 }} />
          <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
          <ChartTooltip content={<ChartTooltipContent hideLabel />} />
          {series.map(({ key }, index) => (
            <Bar
              key={key}
              dataKey={key}
              stackId="difficulty"
              fill={`var(--color-${key})`}
              radius={index === series.length - 1 ? [2, 2, 0, 0] : [0, 0, 0, 0]}
            />
          ))}
        </BarChart>
      </ChartContainer>
    </div>
  );
}
