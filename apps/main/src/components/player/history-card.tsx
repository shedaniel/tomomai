"use client";

import { formatGameRating, getGameDifficulty } from "@/lib/games/presentation";
import { getGame } from "@/lib/games/registry";
import { useGame, usePresentation } from "@/components/providers/game-provider";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@tomomai/ui";
import { Slider } from "@tomomai/ui";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@tomomai/ui";
import { trpc } from "@/lib/trpc-client";
import type { Region } from "@/lib/games/ids";
import { cn } from "@/lib/utils";
import { TrendingUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { HistoryCardSkeleton } from "./history-card.skeleton";
import { CoverImage } from "@/components/cover-image";
import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

interface HistoryCardProps {
  region: Region;
}

// Chart configuration
const chartConfig = {
  rating: {
    label: "Rating",
    color: "var(--primary)",
  },
};

/** The tooltip's default row, which a formatter replaces as a whole. */
function RatingTooltipRow({ color, label, value }: { color?: string; label: string; value: string }) {
  return (
    <>
      <div className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: color }} />
      <div className="flex flex-1 items-center justify-between leading-none">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-foreground font-mono font-medium tabular-nums">{value}</span>
      </div>
    </>
  );
}

export function HistoryCard({ region }: HistoryCardProps) {
  const t = useTranslations();
  const game = useGame().id;
  const formatRating = (value: number | undefined) => formatGameRating(game, value);
  const { axisStep } = usePresentation().ratingRules;
  const { bucketSizes } = getGame(game).rating;
  const bestSize = bucketSizes.new + bucketSizes.old;
  const [chartAreaBounds, setChartAreaBounds] = useState<{ left: number; width: number } | null>(null);
  const [dateRange, setDateRange] = useState<[number, number]>([0, 100]);

  // Fetch rating history from tRPC
  const { data, isLoading } = trpc.user.getRatingHistory.useQuery({ game, region });

  // Format data for the chart (all data)
  const allChartData = useMemo(() => {
    if (!data?.history || data.history.length === 0) return [];

    return data.history.map((entry, index) => {
      const timestamp = new Date(entry.date).getTime();
      return {
        timestamp,
        date: new Date(entry.date).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        }),
        rating: entry.rating,
        fullDate: new Date(entry.date).toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
        changes: entry.changes,
        index,
      };
    });
  }, [data]);

  // Initialize date range when data loads
  useEffect(() => {
    if (allChartData.length > 0) {
      setDateRange([0, allChartData.length - 1]);
    }
  }, [allChartData]);

  // Filter data based on selected range
  const chartData = useMemo(() => {
    if (allChartData.length === 0) return [];
    const [start, end] = dateRange;
    return allChartData.slice(start, end + 1);
  }, [allChartData, dateRange]);

  // Calculate min and max for Y-axis domain
  const { minRating, maxRating, minTime, maxTime } = useMemo(() => {
    if (chartData.length === 0) return { minRating: 0, maxRating: 15000, minTime: 0, maxTime: 0 };

    const ratings = chartData.map((d) => d.rating);
    const min = Math.min(...ratings);
    const max = Math.max(...ratings);

    // Add padding to make the chart more readable
    const padding = Math.max(axisStep / 2, (max - min) * 0.1);

    const timestamps = chartData.map((d) => d.timestamp);
    const minTime = Math.min(...timestamps);
    const maxTime = Math.max(...timestamps);

    return {
      minRating: Math.max(0, Math.floor((min - padding) / axisStep) * axisStep),
      maxRating: Math.ceil((max + padding) / axisStep) * axisStep,
      minTime,
      maxTime,
    };
  }, [chartData, axisStep]);

  // Calculate chart area bounds after render
  useEffect(() => {
    const updateBounds = () => {
      // Fallback: find by class
      const chartArea = document.querySelector('.recharts-area');
      if (chartArea) {
        const parent = chartArea.parentElement;
        if (parent) {
          const parentRect = parent.getBoundingClientRect();
          const chartRect = chartArea.getBoundingClientRect();
          setChartAreaBounds({
            left: chartRect.left - parentRect.left,
            width: chartRect.width,
          });
        }
      }
    };

    // Initial calculation with a small delay to ensure chart is rendered
    const timeout = setTimeout(updateBounds, 100);

    // Recalculate on window resize
    window.addEventListener('resize', updateBounds);

    return () => {
      clearTimeout(timeout);
      window.removeEventListener('resize', updateBounds);
    };
  }, [chartData]);

  if (isLoading) {
    return <HistoryCardSkeleton />;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <TrendingUp className="h-5 w-5" />
        {t("dataContent.history.title")}
      </h2>
      <div>
        {chartData.length < 2 ? (
          <div className="h-[400px] flex flex-col items-center justify-center text-muted-foreground">
            <TrendingUp className="h-12 w-12 mb-4 opacity-50" />
            <h3 className="text-lg font-medium mb-2">{t("dataContent.history.noHistory")}</h3>
            <p className="text-sm">{t("dataContent.history.needMoreData")}</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="relative">
              <ChartContainer config={chartConfig} className="h-[400px] w-full">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="ratingGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-rating)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--color-rating)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="timestamp"
                    type="number"
                    domain={[minTime, maxTime]}
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    angle={chartData.length > 15 ? -45 : 0}
                    textAnchor={chartData.length > 15 ? "end" : "middle"}
                    height={chartData.length > 15 ? 80 : 50}
                    tick={{ fontSize: 12 }}
                    tickFormatter={(timestamp) => {
                      return new Date(timestamp).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      });
                    }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    domain={[minRating, maxRating]}
                    tickFormatter={formatRating}
                    tick={{ fontSize: 12 }}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value, _name, item) => (
                          <RatingTooltipRow
                            color={item.color}
                            label={chartConfig.rating.label}
                            value={formatGameRating(game, Number(value), { grouped: true })}
                          />
                        )}
                        labelFormatter={(_, payload) => {
                          if (payload && payload.length > 0) {
                            return payload[0].payload.fullDate;
                          }
                          return "";
                        }}
                      />
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="rating"
                    stroke="var(--color-rating)"
                    fill="url(#ratingGradient)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ChartContainer>

              {/* Song change indicators */}
              {chartAreaBounds && (
                <div className="absolute bottom-8 left-0 right-0 h-12 pointer-events-none">
                  <TooltipProvider delayDuration={100}>
                    {chartData.map((point, idx) => {
                      if (!point.changes || point.changes.length === 0) return null;

                      // Calculate position based on actual timestamp ratio within the chart area
                      const timeRatio = chartData.length === 1
                        ? 0.5
                        : (point.timestamp - minTime) / (maxTime - minTime);
                      const leftPosition = chartAreaBounds.left + (timeRatio * chartAreaBounds.width);
                      const showMultiple = point.changes.length > 2;

                      return (
                        <div
                          key={idx}
                          className="absolute pointer-events-auto"
                          style={{
                            left: `${leftPosition}px`,
                            bottom: showMultiple ? '43px' : '45px',
                            transform: 'translateX(-50%)',
                          }}
                        >
                          {showMultiple ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex items-center justify-center w-6 h-6 rounded-md bg-primary text-primary-foreground text-xs font-bold cursor-pointer hover:scale-110 transition-transform shadow-md">
                                  {point.changes.length}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-xs">
                                <div className="space-y-1">
                                  <div className="text-xs text-muted-foreground mb-1">
                                    {point.fullDate}
                                  </div>
                                  <div className="font-semibold text-sm mb-2">
                                    {point.changes.length} songs changed
                                  </div>
                                  {point.changes.slice(0, 10).map((change, i) => (
                                    <div key={i} className="text-xs">
                                      <div className="font-medium">{change.songName}</div>
                                      <div className="text-muted-foreground">
                                        {getGameDifficulty(game, change.difficultyCode).label} • {change.changeType === 'new' ? t('dataContent.history.newInBest', { size: bestSize }) : `${formatRating(change.oldRating)} → ${formatRating(change.newRating)}`}
                                      </div>
                                    </div>
                                  ))}
                                  {point.changes.length > 10 && (
                                    <div className="text-xs text-muted-foreground">
                                      +{point.changes.length - 10} more...
                                    </div>
                                  )}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <div className="flex gap-1">
                              {point.changes.map((change, changeIdx) => (
                                <Tooltip key={changeIdx}>
                                  <TooltipTrigger asChild>
                                    <div
                                      className={cn(
                                        "w-5 h-5 rounded overflow-hidden cursor-pointer hover:scale-110 transition-transform shadow-md ring-2 ring-offset-1",
                                        getGameDifficulty(game, change.difficultyCode).classes.ring,
                                      )}
                                    >
                                      <CoverImage
                                        coverUrl={change.cover}
                                        alt={change.songName}
                                        width={24}
                                        height={24}
                                        className="w-full h-full object-cover"
                                      />
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">
                                    <div className="space-y-1">
                                      <div className="text-xs text-muted-foreground">
                                        {point.fullDate}
                                      </div>
                                      <div className="font-semibold text-sm">{change.songName}</div>
                                      <div className="text-xs text-muted-foreground">
                                        {getGameDifficulty(game, change.difficultyCode).label}
                                      </div>
                                      <div className="text-xs">
                                        {change.changeType === 'new'
                                          ? t('dataContent.history.newInBestRating', { size: bestSize, rating: formatRating(change.newRating) })
                                          : `${formatRating(change.oldRating)} → ${formatRating(change.newRating)}`
                                        }
                                      </div>
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </TooltipProvider>
                </div>
              )}
            </div>

            {/* Date Range Slider */}
            {allChartData.length > 1 && (
              <div className="px-4 pb-2 space-y-2">
                <div className="flex justify-between items-center text-xs text-muted-foreground">
                  <span>{allChartData[dateRange[0]]?.fullDate || ''}</span>
                  <span className="font-medium">
                    {dateRange[1] - dateRange[0] + 1} / {allChartData.length} snapshots
                  </span>
                  <span>{allChartData[dateRange[1]]?.fullDate || ''}</span>
                </div>
                <Slider
                  value={dateRange}
                  onValueChange={(value) => setDateRange(value as [number, number])}
                  min={0}
                  max={allChartData.length - 1}
                  step={1}
                  className="w-full"
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
