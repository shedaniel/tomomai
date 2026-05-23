"use client";

import { useState, type ReactNode } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import { trpc } from "@/lib/trpc-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@tomomai/ui";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import type { AppRouter } from "@/server/routers/_app";
import { Region } from "@/lib/types";
import { TitleRankingTable } from "./stats/title-ranking-table";
import { SongRankingTable } from "./stats/song-ranking-table";
import { AverageAchievementChart } from "./stats/average-achievement-chart";
import { RatingVsPlayCountHeatmap } from "./stats/rating-vs-play-count-heatmap";
import { DistributionAreaChart } from "./stats/distribution-area-chart";
import { TimeSeriesLineChart } from "./stats/time-series-line-chart";
import { RatingClimbChart } from "./stats/rating-climb-chart";
import { HourWeekdayHeatmap } from "./stats/hour-weekday-heatmap";
import { Tabs, TabsList, TabsTrigger } from "../animate-ui/components/radix/tabs";

type StatsData = inferRouterOutputs<AppRouter>["db"]["getStats"];
type StatCard = {
  key: string;
  titleKey: string;
  descriptionKey?: string;
  render: (d: StatsData, t: ReturnType<typeof useTranslations>) => ReactNode;
};

const CARDS: StatCard[] = [
  {
    key: "rating",
    titleKey: "ratingDistribution",
    render: (d, t) => <DistributionAreaChart data={d.ratingDistribution} xLabel={t("xAxis.rating")} />,
  },
  {
    key: "playCount",
    titleKey: "playCountDistribution",
    render: (d, t) => <DistributionAreaChart data={d.playCountDistribution} xLabel={t("xAxis.playCount")} />,
  },
  {
    key: "topTitles",
    titleKey: "topTitles",
    render: (d) => <TitleRankingTable data={d.titleRanking} />,
  },
  {
    key: "topSongs",
    titleKey: "topSongs",
    render: (d) => <SongRankingTable data={d.mostPlayedSongs} />,
  },
  {
    key: "avgAchievement",
    titleKey: "averageAchievementByLevel",
    render: (d) => <AverageAchievementChart data={d.averageAchievementByLevel} />,
  },
  {
    key: "ratingVsPlayCount",
    titleKey: "ratingVsPlayCount",
    render: (d) => <RatingVsPlayCountHeatmap data={d.ratingVsPlayCount} />,
  },
  {
    key: "ratingClimb",
    titleKey: "ratingClimbByBand",
    render: (d) => <RatingClimbChart data={d.ratingClimbByBand} />,
  },
  {
    key: "newPlayers",
    titleKey: "newPlayersPerWeek",
    render: (d, t) => (
      <TimeSeriesLineChart
        data={d.newPlayersPerWeek}
        xKey="week"
        yKey="count"
        xLabel={t("xAxis.week")}
        yLabel={t("yAxis.newPlayers")}
        formatXAxis={(v) =>
          new Date(`${v}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })
        }
        formatXTooltip={(v) =>
          new Date(`${v}T00:00:00`).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
        }
      />
    ),
  },
  {
    key: "activeUsers",
    titleKey: "activeUsersOverTime",
    render: (d, t) => (
      <TimeSeriesLineChart
        data={d.activeUsersOverTime}
        xKey="days"
        yKey="count"
        xLabel={t("xAxis.days")}
        yLabel={t("yAxis.activeUsers")}
        formatXAxis={(v) => String(v)}
        formatXTooltip={(v) =>
          Number(v) === 1 ? t("xAxis.lastDay") : t("xAxis.lastDays", { days: Number(v) })
        }
        tooltipXLabel={t("xAxis.timePeriod")}
      />
    ),
  },
  {
    key: "fetchesPerDay",
    titleKey: "fetchesPerDay",
    render: (d, t) => (
      <TimeSeriesLineChart
        data={d.fetchesPerDay}
        xKey="date"
        yKey="count"
        xLabel={t("xAxis.date")}
        yLabel={t("yAxis.usersWithFetches")}
        formatXAxis={(v) =>
          new Date(`${v}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })
        }
        formatXTooltip={(v) =>
          new Date(`${v}T00:00:00`).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
        }
      />
    ),
  },
  {
    key: "fetchActivity",
    titleKey: "fetchActivityHeatmap",
    descriptionKey: "heatmapTimezoneNote",
    render: (d) => <HourWeekdayHeatmap data={d.fetchActivityHeatmap} />,
  },
  {
    key: "playActivity",
    titleKey: "playActivityHeatmap",
    descriptionKey: "heatmapTimezoneNote",
    render: (d) => <HourWeekdayHeatmap data={d.playActivityHeatmap} />,
  },
];

export function StatsDatabase() {
  const t = useTranslations("db.stats");
  const [region, setRegion] = useState<Region>("intl");

  const { data, isLoading } = trpc.db.getStats.useQuery({ region });

  return (
    <div className="space-y-6 pt-3">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground max-w-3xl leading-relaxed">
          {t("description")}
        </p>
      </header>
      <div className="flex justify-between items-center">
        <Tabs value={region} onValueChange={(v) => setRegion(v as Region)}>
          <TabsList className="grid grid-cols-[1fr_1fr] gap-2">
            <TabsTrigger value="intl">{t("region.intl")}</TabsTrigger>
            <TabsTrigger value="jp">{t("region.jp")}</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : data ? (
        <div className="columns-1 md:columns-2 gap-6 space-y-6 mb-6">
          {CARDS.map((card) => (
            <Card key={card.key} className="break-inside-avoid">
              <CardHeader>
                <CardTitle>{t(card.titleKey)}</CardTitle>
                {card.descriptionKey ? (
                  <CardDescription>{t(card.descriptionKey)}</CardDescription>
                ) : null}
              </CardHeader>
              <CardContent>{card.render(data, t)}</CardContent>
            </Card>
          ))}
        </div>
      ) : null}
    </div>
  );
}
