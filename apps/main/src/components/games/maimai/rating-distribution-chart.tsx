"use client";

import type { GamePlayerScore } from "@/lib/games/player-view";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@tomomai/ui";
import { Bar, BarChart, XAxis, YAxis } from "recharts";

type RatedScore = Pick<GamePlayerScore, "difficultyCode"> & { rating: number };

function groupSongsByRating(songs: RatedScore[]) {
  if (songs.length === 0) return [];

  const ratings = songs.map(song => song.rating);
  const minRating = Math.min(...ratings);
  const maxRating = Math.max(...ratings);

  const grouped = [];
  for (let rating = minRating; rating <= maxRating; rating++) {
    const songsAtRating = songs.filter(song => song.rating === rating);

    // Group by difficulty within each rating
    const difficultyCounts = {
      basic: songsAtRating.filter(s => s.difficultyCode === 0).length,
      advanced: songsAtRating.filter(s => s.difficultyCode === 1).length,
      expert: songsAtRating.filter(s => s.difficultyCode === 2).length,
      master: songsAtRating.filter(s => s.difficultyCode === 3).length,
      remaster: songsAtRating.filter(s => s.difficultyCode === 4).length,
      utage: songsAtRating.filter(s => s.difficultyCode === 5).length,
    };

    grouped.push({
      rating: rating.toString(),
      ...difficultyCounts,
      total: songsAtRating.length,
    });
  }

  return grouped;
}

const chartConfig = {
  basic: {
    label: "Basic",
    color: "hsl(142, 76%, 36%)", // green
  },
  advanced: {
    label: "Advanced",
    color: "hsl(45, 93%, 47%)", // yellow
  },
  expert: {
    label: "Expert",
    color: "hsl(0, 84%, 60%)", // red
  },
  master: {
    label: "Master",
    color: "hsl(271, 81%, 56%)", // purple
  },
  remaster: {
    label: "Re:Master",
    color: "hsl(270, 95%, 85%)", // light purple
  },
  utage: {
    label: "Utage",
    color: "hsl(330, 81%, 60%)", // pink
  },
};

export function MaimaiRatingDistributionChart({ songs, title }: { songs: RatedScore[]; title: string }) {
  const chartData = groupSongsByRating(songs);

  if (songs.length === 0) return null;

  return (
    <div className="space-y-2 flex flex-col border border-border py-4 rounded-md">
      <span className="text-sm text-center font-semibold">{title}</span>
      <ChartContainer config={chartConfig} className="h-[200px] w-full pr-10">
        <BarChart data={chartData}>
          <XAxis
            dataKey="rating"
            tickLine={false}
            tickMargin={10}
            axisLine={false}
            tick={{ fontSize: 11 }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11 }}
          />
          <ChartTooltip
            content={<ChartTooltipContent hideLabel />}
          />
          <Bar
            dataKey="basic"
            stackId="difficulty"
            fill="var(--color-basic)"
            radius={[0, 0, 0, 0]}
          />
          <Bar
            dataKey="advanced"
            stackId="difficulty"
            fill="var(--color-advanced)"
            radius={[0, 0, 0, 0]}
          />
          <Bar
            dataKey="expert"
            stackId="difficulty"
            fill="var(--color-expert)"
            radius={[0, 0, 0, 0]}
          />
          <Bar
            dataKey="master"
            stackId="difficulty"
            fill="var(--color-master)"
            radius={[0, 0, 0, 0]}
          />
          <Bar
            dataKey="remaster"
            stackId="difficulty"
            fill="var(--color-remaster)"
            radius={[0, 0, 0, 0]}
          />
          <Bar
            dataKey="utage"
            stackId="difficulty"
            fill="var(--color-utage)"
            radius={[2, 2, 0, 0]}
          />
        </BarChart>
      </ChartContainer>
    </div>
  );
}
