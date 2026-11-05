"use client";

import { useFormatter, useTranslations } from "next-intl";
import { formatSongInstanceId } from "@tomomai/games/song-ids";
import { useGame } from "@/components/providers/game-provider";
import type { ChartInsightsProps } from "@/components/games/registry";
import { PercentileDistribution } from "@/components/games/maimai/percentile-distribution";
import { supportsGameFeature } from "@/lib/games/frontend";
import { peerRank, shareAtOrBelow } from "@/lib/games/maimai/percentile/chart";
import { trpc } from "@/lib/trpc-client";

const instanceId = (chart: ChartInsightsProps["chart"]) => formatSongInstanceId(chart.parentId, chart.region, chart.gameVersion);

/** One request for every chart of the song in a region, so each row and the dialog read the same cached answer. */
function usePercentile({ chart, playerRating, regionCharts }: ChartInsightsProps) {
  const game = useGame();
  const enabled = supportsGameFeature(game, "percentiles") && playerRating !== null && playerRating > 0;
  const { data, isLoading } = trpc.maimai.getChartPercentiles.useQuery(
    {
      songs: regionCharts.map(entry => ({ publicSongId: instanceId(entry.chart), achievement: entry.score?.scoreValue ?? 0 })),
      userRating: playerRating ?? 0,
    },
    { enabled, staleTime: 5 * 60 * 1000 },
  );
  return { enabled, isLoading, entry: data?.percentiles[instanceId(chart)] ?? null };
}

/** How the viewer's score on a chart compares with players around their rating. */
export function MaimaiChartPercentile(props: ChartInsightsProps) {
  const { enabled, isLoading, entry } = usePercentile(props);
  if (!enabled) return null;
  if (isLoading) return <div className="h-60 animate-pulse rounded bg-muted" />;
  if (!entry) return null;
  return <PercentileDistribution data={{ ...entry, userAchievement: props.score?.scoreValue ?? null }} withSeparator={false} />;
}

/** The viewer's standing among peers on a chart they played, as a short chip. */
export function MaimaiChartPercentileBadge(props: ChartInsightsProps) {
  const t = useTranslations("db.songs.detail.peers");
  const format = useFormatter();
  const { entry } = usePercentile(props);
  const score = props.score?.scoreValue;
  if (!entry || entry.percentile == null || score == null) return null;
  const rank = peerRank(entry.percentile, shareAtOrBelow(entry.distribution, score));
  const percent = format.number(Math.max(rank.share, 0.01), { style: "percent", maximumFractionDigits: 0 });
  return (
    <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-primary">
      {rank.kind === "median" ? t("median") : t(rank.kind, { percent })}
    </span>
  );
}
