"use client";

import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogTrigger,
} from "@tomomai/ui";
import { useGame, usePresentation } from "@/components/providers/game-provider";
import { codeOf } from "@/lib/games/codes";
import { formatEstimated, formatGameScore, formatGameRating, getGameDifficulty, getGameScoreGrade, getGameStatusBadges } from "@/lib/games/presentation";
import { isGameCnExclusive, supportsGameFeature } from "@/lib/games/frontend";
import { getGame } from "@/lib/games/registry";
import { getVersion } from "@/lib/games/versions";
import { trpc } from "@/lib/trpc-client";
import { useSession } from "@/lib/auth-client";
import type { Region } from "@/lib/games/ids";
import { cn } from "@/lib/utils";
import { Activity, Calendar, ChevronRight, Globe, Loader2, Music, Pencil, Share } from "lucide-react";

import { CoverImage } from "@/components/cover-image";
import { ChartLevel } from "@/components/games/chart-level";
import { ChartTypeBadge } from "@/components/games/chart-type-badge";
import { useEffect, useMemo, useRef } from "react";
import { ChartTypeKey, SongDetailChart, SongDetailHistoricalChart, SongDetails, SongExtendedIdentified, UserScore } from "./types";

import { Button } from "@tomomai/ui";
import { Separator } from "@tomomai/ui";
import { resolveBaseUrl } from "@/lib/base-url";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation"
import { toast } from "sonner";
import { SongChartDialogContent } from "./song-detail-dialog";


function isSongDetailChart(
  chart: SongDetailChart | SongDetailHistoricalChart,
): chart is SongDetailChart {
  return "level" in chart;
}

interface SongDetailContentProps {
  songName: string;
  artist?: string;
  slug: string;
  type: ChartTypeKey;
  parentIds?: string[];
  initialData?: SongDetails | null;
}

export function getChartsByDifficulty(regions: SongDetails['regions']): Map<string, SongExtendedIdentified[]> {
  const record = new Map<string, SongExtendedIdentified[]>();
  for (const region of (regions ?? [])) {
    const latestGameVersion = Math.max(...region.versions.map(v => v.gameVersion));
    const latestVersion = region.versions.find(v => v.gameVersion === latestGameVersion)!;
    for (const chart of latestVersion.charts) {
      if (!isSongDetailChart(chart)) continue;
      if (!record.has(chart.difficulty)) {
        record.set(chart.difficulty, []);
      }
      record.get(chart.difficulty)!.push({ ...chart, region: region.region, gameVersion: latestGameVersion });
    }
  }
  return record;
}

export function getChartScores(charts: SongExtendedIdentified[], userScores: SongDetails['userScores']): Record<Region, UserScore> {
  return charts.reduce((acc, chart) => {
    const score = userScores?.[chart.region]?.[chart.difficulty];
    if (score) {
      acc[chart.region] = score;
    }
    return acc;
  }, {} as Record<Region, UserScore>);
}

function SongBadges({ score }: { score: UserScore }) {
  const game = useGame();
  return <div className="flex flex-wrap gap-1">{getGameStatusBadges(game.id, score).map(badge => <span key={badge.label} className={cn("px-1 rounded-[2px] text-[9px] font-bold text-white uppercase flex items-center", badge.className)}>{badge.label}</span>)}</div>;
}

function ScoreGrid({
  charts,
  scores,
}: {
  charts: SongExtendedIdentified[];
  scores: Record<Region, UserScore>,
}) {
  const t = useTranslations();
  const game = useGame();
  const { scoreLabel } = usePresentation();

  return (
    <div className={cn(
      "col-span-full grid gap-4 px-4 py-3 bg-muted/30 border-t border-dashed",
      Object.keys(scores).length === 3 ? "grid-cols-6" : Object.keys(scores).length === 2 ? "grid-cols-4" : "grid-cols-2"
    )}>
      {Object.entries(scores).map(([region, score]) => {
        const chart = charts.find(c => c.region === region)!;
        const rating = score ? getGame(game.id).rating.chartRating({
          scoreValue: score.scoreValue,
          levelPrecise: chart.levelPrecise,
          difficultyCode: codeOf(game.id, "difficulty", chart.difficulty),
          comboStatus: score.comboStatus,
        }, chart.gameVersion) : null;

        const label = t(`regions.${region}`);

        return (
          <div key={region} className="contents">
            <div className="flex flex-col min-w-0">
              <div className="text-[10px] text-muted-foreground font-semibold uppercase mb-0.5 truncate">
                {`${label} ${t(`db.songs.detail.${scoreLabel}`)}`}
              </div>
              <div className="flex items-start gap-y-0.5 flex-col">
                {score ? (
                  <>
                    <span className="text-sm font-semibold tabular-nums truncate">
                      {formatGameScore(game.id, score.scoreValue)}
                    </span>
                    <SongBadges score={score} />
                  </>
                ) : (
                  <span className="text-sm text-muted-foreground">-</span>
                )}
              </div>
            </div>

            <div className="flex flex-col min-w-0">
              <div className="text-[10px] text-muted-foreground font-semibold uppercase mb-0.5 truncate">
                {`${label} ${t('db.songs.detail.rating')}`}
              </div>
              <div className="flex items-baseline gap-2">
                {score ? (
                  <>
                    <span className="text-sm font-bold tabular-nums text-primary">
                      {formatEstimated(formatGameRating(game.id, rating), chart.levelPreciseEstimated)}
                    </span>
                    <span className="text-xs text-muted-foreground font-medium">
                      ({getGameScoreGrade(game.id, score.scoreValue, chart.gameVersion, score.comboStatus)})
                    </span>
                  </>
                ) : (
                  <span className="text-sm text-muted-foreground">-</span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function SongChartRow({ difficulty, charts, index, data, hasNoteCounts, hasTouch }: {
  difficulty: string;
  charts: SongExtendedIdentified[];
  index: number;
  data: SongDetails;
  hasNoteCounts: boolean;
  hasTouch: boolean;
}) {
  const t = useTranslations();
  const game = useGame();
  const latestChart: SongExtendedIdentified = charts.find(c => c.gameVersion === Math.max(...charts.map(c => c.gameVersion)))!;

  const difficultyPresentation = getGameDifficulty(game.id, codeOf(game.id, "difficulty", difficulty));
  const hasNoteData = latestChart.tapCount !== null;
  const totalNotes = hasNoteData
    ? (latestChart.tapCount ?? 0) + (latestChart.holdCount ?? 0) + (latestChart.slideCount ?? 0) + (latestChart.touchCount ?? 0) + (latestChart.breakCount ?? 0)
    : null;
  const dataBorderClass = index === 0 ? "" : "border-t";

  const chartScores: Record<Region, UserScore> = useMemo(() => {
    return getChartScores(charts, data.userScores);
  }, [charts, data?.userScores]);

  return (
    <ResponsiveDialog key={difficulty}>
      <ResponsiveDialogTrigger asChild>
        <div className="contents text-sm group *:group-hover:bg-accent *:transition-colors *:duration-200">
          {/* Difficulty */}
          <div className={cn("py-2.5 px-3 flex items-center gap-2", dataBorderClass)}>
            <span className={cn("font-bold", difficultyPresentation.classes.text)}>
              {difficultyPresentation.label}
            </span>
          </div>
          {/* Level */}
          <div className={cn("py-2.5 px-3 flex items-baseline justify-center", dataBorderClass)}>
            <ChartLevel chart={latestChart} variant="split" />
          </div>
          {hasNoteCounts && <>
          {/* Notes */}
          <div className={cn("py-2.5 px-3 flex items-center justify-center tabular-nums", dataBorderClass)}>
            {hasNoteData ? totalNotes : "-"}
          </div>
          {/* Tap */}
          <div className={cn("py-2.5 px-3 flex items-center justify-center tabular-nums", dataBorderClass)}>
            {hasNoteData ? latestChart.tapCount : "-"}
          </div>
          {/* Hold */}
          <div className={cn("py-2.5 px-3 flex items-center justify-center tabular-nums", dataBorderClass)}>
            {hasNoteData ? latestChart.holdCount : "-"}
          </div>
          {/* Slide */}
          <div className={cn("py-2.5 px-3 flex items-center justify-center tabular-nums", dataBorderClass)}>
            {hasNoteData ? latestChart.slideCount : "-"}
          </div>
          {/* Touch */}
          {hasTouch && <div className={cn("py-2.5 px-3 flex items-center justify-center tabular-nums", dataBorderClass)}>
            {hasNoteData ? latestChart.touchCount : "-"}
          </div>}
          {/* Break */}
          <div className={cn("py-2.5 px-3 flex items-center justify-center tabular-nums", dataBorderClass)}>
            {hasNoteData ? latestChart.breakCount : "-"}
          </div>
          </>}
          {/* ChevronRight */}
          <div className={cn("pl-1 pr-3 flex items-center justify-center", dataBorderClass,
            latestChart.noteDesigner && "row-span-2"
          )}>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </div>

          {/* Designer row (spans all columns) */}
          {latestChart.noteDesigner && (
            <div className="col-[1/-2] px-3 pb-2 pt-0 h-7 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Pencil className="w-3 h-3" />
              <span className="font-medium">{t('db.songs.detail.chartDesigner')}</span>
              <span>{latestChart.noteDesigner}</span>
            </div>
          )}

          {/* Score Grid */}
          {Object.keys(chartScores).length > 0 && (
            <ScoreGrid
              charts={charts}
              scores={chartScores}
            />
          )}
        </div>
      </ResponsiveDialogTrigger>
      <ResponsiveDialogContent className="grid w-full gap-4">
        <SongChartDialogContent charts={charts} scores={chartScores} />
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

export function SongDetailContent({ songName, artist, slug, type, parentIds, initialData }: SongDetailContentProps) {
  const t = useTranslations();
  const game = useGame();
  const hasInitialData = !!initialData;
  const { data: session } = useSession();
  const viewerId = session?.user.id ?? null;
  const utils = trpc.useUtils();
  const previousViewerId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const previous = previousViewerId.current;
    previousViewerId.current = viewerId;
    if (previous === undefined || previous === null || previous === viewerId) return;
    void utils.user.getSongScores.reset();
  }, [utils, viewerId]);
  const {
    data: fetchedData,
    isLoading,
    error,
  } = trpc.user.getSongDetails.useQuery(
    { game: game.id, songName, artist: artist ?? initialData?.artist, type, parentIds: parentIds ?? initialData?.parentIds },
    { enabled: !hasInitialData }
  );
  const { data: scoreData } = trpc.user.getSongScores.useQuery(
    { game: game.id, songName, artist: artist ?? initialData?.artist, type, parentIds: parentIds ?? initialData?.parentIds },
    { enabled: hasInitialData && viewerId !== null && supportsGameFeature(game, "scores") }
  );
  const data = useMemo(() => {
    if (!initialData) return fetchedData;
    return {
      ...initialData,
      userScores: scoreData?.viewerId === viewerId ? scoreData.userScores : undefined,
    };
  }, [fetchedData, initialData, scoreData, viewerId]);

  // Get the latest version's charts for display (prefer intl, then jp)
  const chartsByDifficulty: Map<string, SongExtendedIdentified[]> = useMemo(() => {
    return getChartsByDifficulty(data?.regions ?? []);
  }, [data?.regions]);

  const allCharts = useMemo(() => {
    return Array.from(chartsByDifficulty.values()).flat();
  }, [chartsByDifficulty]);
  const hasNoteCounts = supportsGameFeature(game, "note-counts");
  const hasTouch = allCharts.some(chart => chart.touchCount !== null);

  // Pre-compute SEO summary inputs (visible prose paragraph below the header).
  const summary = useMemo(() => {
    if (!data || allCharts.length === 0) return null;
    const levels = allCharts.map((c) => c.levelPrecise).filter((l) => l > 0);
    if (levels.length === 0) return null;
    const minLevel = Math.min(...levels);
    const maxLevel = Math.max(...levels);
    const fmtLevel = (l: number) => (l % 10 === 0 ? String(Math.floor(l / 10)) : (l / 10).toFixed(1));
    return {
      minLevel: fmtLevel(minLevel),
      maxLevel: fmtLevel(maxLevel),
      chartCount: chartsByDifficulty.size,
      bpmFragment: data.bpm ? t('db.songs.detail.summaryBpmFragment', { bpm: data.bpm }) : '',
      versionName: getVersion(game.id, data.addedVersion)?.name ?? `Ver. ${data.addedVersion}`,
      chartLabel: t('db.songs.chartLabel', { type: data.type }),
    };
  }, [data, allCharts, chartsByDifficulty, t, game]);

  const videoSearchURL = useMemo(() => {
    if (!data) return null;
    const searchQuery = encodeURIComponent(`${game.brand.displayName} ${data.songName} ${data.artist}`);
    if (isGameCnExclusive(game)) {
      return `https://search.bilibili.com/all?keyword=${searchQuery}`;
    } else {
      return `https://www.youtube.com/results?search_query=${searchQuery}`;
    }
  }, [data, game]);

  if (!data) {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      );
    }
    if (error) {
      return (
        <div className="text-center py-20 text-muted-foreground">
          {t('db.songs.detail.loadFailed')}
        </div>
      );
    }
    return null;
  }

  const addedVersionInfo = getVersion(game.id, data.addedVersion);

  return (
    <div className="space-y-6">
      {/* Cover and basic info */}
      <div className="flex gap-4">
        <div className="relative w-24 h-24 max-md:w-20 max-md:h-20 shrink-0 rounded-lg overflow-hidden ring-2 ring-offset-2 ring-offset-background ring-slate-200">
          <CoverImage
            coverUrl={data.cover}
            alt={data.songName}
            fill
            className="object-cover"
            sizes="(max-width: 767px) 80px, 96px"
          />
        </div>
        <div className="flex-1 min-w-0 my-auto">
          <h1 className="text-xl max-md:text-md font-bold truncate">{data.songName}</h1>
          <p className="text-muted-foreground max-md:text-sm truncate">{data.artist}</p>
          <div className="flex items-center gap-2 mt-2">
            <ChartTypeBadge typeCode={codeOf(game.id, "chartType", data.type)} size="lg" />
            <span className="text-xs text-muted-foreground truncate">{data.genre}</span>
          </div>
        </div>
      </div>

      {summary && (
        <p className="text-sm text-muted-foreground leading-relaxed">
          {t('db.songs.detail.summary', {
            songName: data.songName,
            artist: data.artist,
            genre: data.genre,
            chartLabel: summary.chartLabel,
            versionName: summary.versionName,
            minLevel: summary.minLevel,
            maxLevel: summary.maxLevel,
            chartCount: summary.chartCount,
            bpmFragment: summary.bpmFragment,
          })}
        </p>
      )}

      <section className="flex flex-wrap justify-between gap-y-3">
        {/* Song Info */}
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {data.bpm && (
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4" />
              <h2 className="font-medium text-sm">{t('db.songs.detail.bpm')}</h2>
              <span>{data.bpm}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            <h2 className="font-medium text-sm">{t('db.songs.detail.added')}</h2>
            <span>{addedVersionInfo?.name ?? `Ver. ${data.addedVersion}`}</span>
          </div>
        </div>

        {/* Buttons or Links */}
        <div className="flex gap-2">
          <Link href={`/db/songs/${slug}`} onClick={async (e) => {
            const baseUrl = resolveBaseUrl();
            navigator.clipboard.writeText(`${baseUrl}/db/songs/${slug}`);
            e.preventDefault();
            toast.success("Share link copied to clipboard");
          }} aria-label={t('db.songs.detail.share')}>
            <Button variant="outline" className="bg-background">
              <Share className="w-4 h-4" />
              {t('db.songs.detail.share')}
            </Button>
          </Link>
          <Link href={videoSearchURL ?? ""} target="_blank" aria-label={t('db.songs.detail.youtube')}>
            <Button variant="outline" className="bg-background">
              {isGameCnExclusive(game) ? (<>
                <svg role="img" className="w-4 h-4" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
                  <g>
                    <path fill="none" d="M0 0h24v24H0z" />
                    <path d="M18.223 3.086a1.25 1.25 0 0 1 0 1.768L17.08 5.996h1.17A3.75 3.75 0 0 1 22 9.747v7.5a3.75 3.75 0 0 1-3.75 3.75H5.75A3.75 3.75 0 0 1 2 17.247v-7.5a3.75 3.75 0 0 1 3.75-3.75h1.166L5.775 4.855a1.25 1.25 0 1 1 1.767-1.768l2.652 2.652c.079.079.145.165.198.257h3.213c.053-.092.12-.18.199-.258l2.651-2.652a1.25 1.25 0 0 1 1.768 0zm.027 5.42H5.75a1.25 1.25 0 0 0-1.247 1.157l-.003.094v7.5c0 .659.51 1.199 1.157 1.246l.093.004h12.5a1.25 1.25 0 0 0 1.247-1.157l.003-.093v-7.5c0-.69-.56-1.25-1.25-1.25zm-10 2.5c.69 0 1.25.56 1.25 1.25v1.25a1.25 1.25 0 1 1-2.5 0v-1.25c0-.69.56-1.25 1.25-1.25zm7.5 0c.69 0 1.25.56 1.25 1.25v1.25a1.25 1.25 0 1 1-2.5 0v-1.25c0-.69.56-1.25 1.25-1.25z" />
                  </g>
                </svg>
                bilibili 搜索
              </>) : (<>
                <svg role="img" className="w-4 h-4" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><title>YouTube</title><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" /></svg>
                {t('db.songs.detail.youtube')}
              </>)}
            </Button>
          </Link>
        </div>
        <Separator className="mt-2" />
      </section>

      {/* Charts Grid */}
      {chartsByDifficulty.size > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Music className="w-4 h-4" />
            {t('db.songs.detail.charts')}
          </h2>

          <div className={
            cn("border rounded-md overflow-x-auto grid",
              !hasNoteCounts ? "grid-cols-[minmax(100px,1fr)_auto_auto]" : hasTouch ? "grid-cols-[minmax(100px,1fr)_auto_1fr_1fr_1fr_1fr_1fr_1fr_auto]" : "grid-cols-[minmax(100px,1fr)_auto_1fr_1fr_1fr_1fr_1fr_auto]")}>
            {/* Header Row */}
            <div className="contents text-xs bg-accent/50 font-medium text-muted-foreground">
              <div className="py-2 px-3 border-b">{t('db.common.difficulty')}</div>
              <div className="py-2 px-3 text-center border-b">{t('db.common.level')}</div>
              {hasNoteCounts && <>
              <div className="py-2 px-3 text-center border-b">{t('db.common.notes')}</div>
              <div className="py-2 px-3 text-center border-b">Tap</div>
              <div className="py-2 px-3 text-center border-b">Hold</div>
              <div className="py-2 px-3 text-center border-b">Slide</div>
              {hasTouch && <div className="py-2 px-3 text-center border-b">Touch</div>}
              <div className="py-2 px-3 text-center border-b">Break</div>
              </>}
              <div className="py-2 border-b"></div>
            </div>

            {/* Chart Rows */}
            {Array.from(chartsByDifficulty.entries()).map(([difficulty, charts], index) => (
              <SongChartRow
                key={`${difficulty}-${index}`}
                difficulty={difficulty}
                charts={charts}
                index={index}
                data={data}
                hasNoteCounts={hasNoteCounts}
                hasTouch={hasTouch}
              />
            ))}
          </div>
        </div>
      )}

      {/* Availability by region */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Globe className="w-4 h-4" />
          {t('db.songs.detail.availability')}
        </h2>

        {data.regions.map(({ region, versions }) => (
          <div key={region} className="space-y-2">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium">
                {t(`regions.${region}`)}
              </h3>
            </div>

            <div className="space-y-3 pl-4 border-l-2 border-muted">
              {versions.map(({ gameVersion, charts }) => {
                const versionInfo = getVersion(game.id, gameVersion);

                // Group charts by difficulty to show level changes
                const byDifficulty = new Map<string, (SongDetailChart | SongDetailHistoricalChart)[]>();
                charts.forEach(chart => {
                  if (!byDifficulty.has(chart.difficulty)) {
                    byDifficulty.set(chart.difficulty, []);
                  }
                  byDifficulty.get(chart.difficulty)!.push(chart);
                });

                // Sort by difficulty order
                const sortedDifficulties = Array.from(byDifficulty.entries())
                  .map(([difficulty, diffCharts]) => [codeOf(game.id, "difficulty", difficulty), diffCharts] as const)
                  .sort((a, b) => a[0] - b[0]);

                return (
                  <div key={gameVersion} className="space-y-1">
                    <div className="flex items-center gap-2 text-xs">
                      <Calendar className="w-3 h-3 text-muted-foreground" />
                      <span className="font-medium">{versionInfo?.name ?? `v${gameVersion}`}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pl-5">
                      {sortedDifficulties.map(([difficultyCode, diffCharts]) => {
                        const chart = diffCharts[0];
                        const difficulty = getGameDifficulty(game.id, difficultyCode);
                        return (
                          <div
                            key={difficultyCode}
                            className={cn(
                              "px-2 py-0.5 rounded text-xs font-medium text-white",
                              difficulty.classes.solidBg
                            )}
                          >
                            {difficulty.label} <ChartLevel chart={chart} />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
