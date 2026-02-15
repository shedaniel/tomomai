"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Region } from "@/lib/types";
import { RatingDistributionChart } from "./stats/rating-distribution-chart";
import { PlayCountDistributionChart } from "./stats/play-count-distribution-chart";
import { TitleRankingTable } from "./stats/title-ranking-table";
import { SongRankingTable } from "./stats/song-ranking-table";
import { AverageAchievementChart } from "./stats/average-achievement-chart";
import { RatingVsPlayCountHeatmap } from "./stats/rating-vs-play-count-heatmap";
import { ActiveUsersChart } from "./stats/active-users-chart";
import { FetchesPerDayChart } from "./stats/fetches-per-day-chart";
import { Tabs, TabsList, TabsTab } from "../animate-ui/components/base/tabs";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

export function StatsDatabase() {
  const t = useTranslations("db.stats");
  const [region, setRegion] = useState<Region>("intl");

  const { data, isLoading } = trpc.db.getStats.useQuery({ region });

  return (
    <div className="space-y-6">
      <VisuallyHidden asChild>
        <h1>{t("title")}</h1>
      </VisuallyHidden>
      <div className="flex justify-between items-center">
        <Tabs value={region} onValueChange={(v) => setRegion(v as Region)}>
          <TabsList className="grid grid-cols-[1fr_1fr] gap-2">
            <TabsTab value="intl">{t("region.intl")}</TabsTab>
            <TabsTab value="jp">{t("region.jp")}</TabsTab>
          </TabsList>
        </Tabs>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : data ? (
        <div className="columns-1 md:columns-2 gap-6 space-y-6 mb-6">
          <Card className="break-inside-avoid">
            <CardHeader>
              <CardTitle>{t("ratingDistribution")}</CardTitle>
            </CardHeader>
            <CardContent>
              <RatingDistributionChart data={data.ratingDistribution} />
            </CardContent>
          </Card>

          <Card className="break-inside-avoid">
            <CardHeader>
              <CardTitle>{t("playCountDistribution")}</CardTitle>
            </CardHeader>
            <CardContent>
              <PlayCountDistributionChart data={data.playCountDistribution} />
            </CardContent>
          </Card>

          <Card className="break-inside-avoid">
            <CardHeader>
              <CardTitle>{t("topTitles")}</CardTitle>
            </CardHeader>
            <CardContent>
              <TitleRankingTable data={data.titleRanking} />
            </CardContent>
          </Card>

          <Card className="break-inside-avoid">
            <CardHeader>
              <CardTitle>{t("topSongs")}</CardTitle>
            </CardHeader>
            <CardContent>
              <SongRankingTable data={data.mostPlayedSongs} />
            </CardContent>
          </Card>

          <Card className="break-inside-avoid">
            <CardHeader>
              <CardTitle>{t("averageAchievementByLevel")}</CardTitle>
            </CardHeader>
            <CardContent>
              <AverageAchievementChart data={data.averageAchievementByLevel} />
            </CardContent>
          </Card>

          <Card className="break-inside-avoid">
            <CardHeader>
              <CardTitle>{t("ratingVsPlayCount")}</CardTitle>
            </CardHeader>
            <CardContent>
              <RatingVsPlayCountHeatmap data={data.ratingVsPlayCount} />
            </CardContent>
          </Card>

          <Card className="break-inside-avoid">
            <CardHeader>
              <CardTitle>{t("activeUsersOverTime")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ActiveUsersChart data={data.activeUsersOverTime} />
            </CardContent>
          </Card>

          <Card className="break-inside-avoid">
            <CardHeader>
              <CardTitle>{t("fetchesPerDay")}</CardTitle>
            </CardHeader>
            <CardContent>
              <FetchesPerDayChart data={data.fetchesPerDay} />
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
