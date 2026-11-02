"use client";

import { formatSongInstanceId } from "@tomomai/games/song-ids";
import { useGame } from "@/components/providers/game-provider";
import type { ChartInsightsProps } from "@/components/games/registry";
import { PercentileDistribution } from "@/components/games/maimai/percentile-distribution";
import { supportsGameFeature } from "@/lib/games/frontend";
import { trpc } from "@/lib/trpc-client";

/** How the viewer's score on a chart compares with players around their rating. */
export function MaimaiChartPercentile({ chart, score, playerRating }: ChartInsightsProps) {
  const game = useGame();
  const enabled = supportsGameFeature(game, "percentiles") && playerRating !== null && playerRating > 0;
  const publicSongId = formatSongInstanceId(chart.parentId, chart.region, chart.gameVersion);
  const { data, isLoading } = trpc.maimai.getChartPercentiles.useQuery(
    { songs: [{ publicSongId, achievement: score?.scoreValue ?? 0 }], userRating: playerRating ?? 0 },
    { enabled, staleTime: 5 * 60 * 1000 },
  );
  if (!enabled) return null;
  const entry = data?.percentiles[publicSongId];
  if (isLoading) return <div className="h-60 animate-pulse rounded bg-muted" />;
  if (!entry) return null;
  return <PercentileDistribution data={{ ...entry, userAchievement: score?.scoreValue ?? null }} withSeparator={false} />;
}
