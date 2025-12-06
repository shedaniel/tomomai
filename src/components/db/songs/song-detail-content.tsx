"use client";

import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { DIFFICULTY_COLORS, getAchievementRate } from "@/lib/difficulty";
import { getVersionInfo } from "@/lib/metadata";
import { calculateSongRating } from "@/lib/rating-calculator";
import { trpc } from "@/lib/trpc-client";
import { Difficulty, Region, SongExtended } from "@/lib/types";
import { cn, createSafeMaimaiImageUrl } from "@/lib/utils";
import { Activity, Calendar, ChevronRight, Globe, Loader2, Music, Pencil, Share } from "lucide-react";
import Image from "next/image";
import { useMemo } from "react";
import { SongDetails, UserScore } from "./types";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { resolveBaseUrl } from "@/lib/base-url";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { toast } from "sonner";
import { SongChartDialogContent } from "./song-detail-dialog";

type SongExtendedIdentified = SongExtended & { region: Region; gameVersion: number };

function getRate(achievement: number, version: number, fc: string) {
  if (version >= 12 && (fc === "ap" || fc === "ap+")) return "SSS+ AP";
  return getAchievementRate(achievement);
}

interface SongDetailContentProps {
  songName: string;
  slug: string;
  type: "std" | "dx";
  onClose: () => void;
  initialData?: SongDetails | null;
}

export function getChartsByDifficulty(regions: SongDetails['regions']): Map<Difficulty, SongExtendedIdentified[]> {
  const record = new Map<Difficulty, SongExtendedIdentified[]>();
  for (const region of (regions ?? [])) {
    const latestGameVersion = Math.max(...region.versions.map(v => v.gameVersion));
    const latestVersion = region.versions.find(v => v.gameVersion === latestGameVersion)!;
    for (const chart of latestVersion.charts) {
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

function SongBadges({ fc, fs }: { fc: string; fs: string }) {
  return (
    <div className="flex gap-1">
      <span className={cn(
        "px-1 rounded-[2px] text-[9px] font-bold text-white uppercase flex items-center",
        fc === "ap+" && "bg-gradient-to-r from-orange-400 to-pink-500",
        fc === "ap" && "bg-pink-500",
        fc === "fc+" && "bg-gradient-to-r from-emerald-400 to-teal-500",
        fc === "fc" && "bg-emerald-500",
        fc === "none" && "hidden",
      )}>{fc}</span>

      <span className={cn(
        "px-1 rounded-[2px] text-[9px] font-bold text-white uppercase flex items-center",
        fs === "fdx+" && "bg-gradient-to-r from-orange-400 to-amber-500",
        fs === "fdx" && "bg-orange-500",
        fs === "fs+" && "bg-gradient-to-r from-blue-400 to-indigo-500",
        fs === "fs" && "bg-blue-500",
        fs === "sync" && "bg-slate-500",
        fs === "none" && "hidden",
      )}>{fs}</span>
    </div>
  )
}

function ScoreGrid({
  charts,
  scores,
}: {
  charts: SongExtendedIdentified[];
  scores: Record<Region, UserScore>,
}) {
  const t = useTranslations();

  return (
    <div className={cn(
      "col-span-full grid gap-4 px-4 py-3 bg-muted group-hover:!bg-primary/10 border-t border-dashed",
      Object.keys(scores).length === 2 ? "grid-cols-4" : "grid-cols-2"
    )}>
      {Object.entries(scores).map(([region, score]) => {
        const chart = charts.find(c => c.region === region)!;
        const rating = score ? calculateSongRating({
          achievement: score.achievement,
          fc: score.fc as any,
          levelPrecise: chart.levelPrecise,
          addedVersion: chart.addedVersion
        }, chart.gameVersion) : 0;

        const label = region === 'intl' ? t('regions.intl') : t('regions.jp');

        return (
          <div key={region} className="contents">
            <div className="flex flex-col min-w-0">
              <div className="text-[10px] text-muted-foreground font-semibold uppercase mb-0.5 truncate">
                {`${label} ${t('db.songs.detail.achievement')}`}
              </div>
              <div className="flex items-start gap-y-0.5 flex-col">
                {score ? (
                  <>
                    <span className="text-sm font-semibold tabular-nums truncate">
                      {(score.achievement / 10000).toFixed(4)}%
                    </span>
                    <SongBadges fc={score.fc} fs={score.fs} />
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
                      {Math.floor(rating)}
                    </span>
                    <span className="text-xs text-muted-foreground font-medium">
                      ({getRate(score.achievement, chart.gameVersion, score.fc)})
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

export function SongChartRow({ difficulty, charts, index, data, hasTouch }: {
  difficulty: Difficulty;
  charts: SongExtendedIdentified[];
  index: number;
  data: SongDetails;
  hasTouch: boolean;
}) {
  const t = useTranslations();
  const latestChart: SongExtendedIdentified = charts.find(c => c.gameVersion === Math.max(...charts.map(c => c.gameVersion)))!;

  const colors = DIFFICULTY_COLORS[difficulty] || { bg: "bg-gray-500", text: "text-gray-600", border: "border-gray-500" };
  const hasNoteData = latestChart.tapCount !== null;
  const totalNotes = hasNoteData
    ? (latestChart.tapCount ?? 0) + (latestChart.holdCount ?? 0) + (latestChart.slideCount ?? 0) + (latestChart.touchCount ?? 0) + (latestChart.breakCount ?? 0)
    : null;
  const dataBorderClass = index === 0 ? "" : "border-t";

  const chartScores: Record<Region, UserScore> = useMemo(() => {
    return getChartScores(charts, data.userScores);
  }, [charts, data?.userScores]);

  return (
    <Dialog key={difficulty}>
      <DialogTrigger asChild>
        <div className="contents text-sm group *:group-hover:bg-accent *:transition-colors *:duration-200">
          {/* Difficulty */}
          <div className={cn("py-2.5 px-3 flex items-center gap-2", dataBorderClass)}>
            <span className={cn("font-bold", colors.text)}>
              {t(`common.difficulties.${difficulty}`)}
            </span>
          </div>
          {/* Level */}
          <div className={cn("py-2.5 px-3 flex items-baseline justify-center", dataBorderClass)}>
            <span className="text-lg font-bold tabular-nums">{latestChart.level}</span>
            <span className="text-xs">.{latestChart.levelPrecise % 10}</span>
          </div>
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
      </DialogTrigger>
      <DialogContent>
        <SongChartDialogContent charts={charts} scores={chartScores} />
      </DialogContent>
    </Dialog>
  );
}

export function SongDetailContent({ songName, slug, type, initialData }: SongDetailContentProps) {
  const t = useTranslations();
  const { data: fetchedData, isLoading, error } = trpc.user.getSongDetails.useQuery(
    { songName, type },
    {
      staleTime: 300000,
      enabled: !initialData,
    }
  );

  const data = initialData ?? fetchedData;
  const difficultyOrder = ["basic", "advanced", "expert", "master", "remaster", "utage"];

  // Get the latest version's charts for display (prefer intl, then jp)
  const chartsByDifficulty: Map<Difficulty, SongExtendedIdentified[]> = useMemo(() => {
    return getChartsByDifficulty(data?.regions ?? []);
  }, [data?.regions]);

  const allCharts = useMemo(() => {
    return Array.from(chartsByDifficulty.values()).flat();
  }, [chartsByDifficulty]);
  const hasTouch = allCharts.some(chart => chart.touchCount !== null);

  const youtubeSearchURL = useMemo(() => {
    if (!data) return null;
    const searchQuery = encodeURIComponent(`maimai ${data.songName} ${data.artist}`);
    return `https://www.youtube.com/results?search_query=${searchQuery}`;
  }, [data]);

  if (!initialData && isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        Failed to load song details
      </div>
    );
  }

  const addedVersionInfo = getVersionInfo(data.addedVersion);

  return (
    <div className="space-y-6">
      {/* Cover and basic info */}
      <div className="flex gap-4">
        <div className="relative w-24 h-24 max-md:w-20 max-md:h-20 shrink-0 rounded-lg overflow-hidden ring-2 ring-offset-2 ring-offset-background ring-slate-200">
          <Image
            src={createSafeMaimaiImageUrl(data.cover)}
            alt={data.songName}
            fill
            className="object-cover"
          />
        </div>
        <div className="flex-1 min-w-0 my-auto">
          <h1 className="text-xl max-md:text-md font-bold truncate">{data.songName}</h1>
          <p className="text-muted-foreground max-md:text-sm truncate">{data.artist}</p>
          <div className="flex items-center gap-2 mt-2">
            <Image
              src={createSafeMaimaiImageUrl(data.type === "dx"
                ? "https://maimaidx.jp/maimai-mobile/img/music_dx.png"
                : "https://maimaidx.jp/maimai-mobile/img/music_standard.png"
              )}
              alt={data.type.toUpperCase()}
              width={64}
              height={20}
              className="drop-shadow-sm"
            />
            <span className="text-xs text-muted-foreground truncate">{data.genre}</span>
          </div>
        </div>
      </div>

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
            const baseUrl = await resolveBaseUrl();
            navigator.clipboard.writeText(`${baseUrl}/db/songs/${slug}`);
            e.preventDefault();
            toast.success("Share link copied to clipboard");
          }} aria-label={t('db.songs.detail.share')}>
            <Button variant="outline" className="bg-background">
              <Share className="w-4 h-4" />
              {t('db.songs.detail.share')}
            </Button>
          </Link>
          <Link href={youtubeSearchURL ?? ""} target="_blank" aria-label={t('db.songs.detail.youtube')}>
            <Button variant="outline" className="bg-background">
              <svg role="img" className="w-4 h-4" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><title>YouTube</title><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
              {t('db.songs.detail.youtube')}
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
              hasTouch ? "grid-cols-[minmax(100px,1fr)_auto_1fr_1fr_1fr_1fr_1fr_1fr_auto]" : "grid-cols-[minmax(100px,1fr)_auto_1fr_1fr_1fr_1fr_1fr_auto]")}>
            {/* Header Row */}
            <div className="contents text-xs bg-accent/50 font-medium text-muted-foreground">
              <div className="py-2 px-3 border-b">{t('db.common.difficulty')}</div>
              <div className="py-2 px-3 text-center border-b">{t('db.common.level')}</div>
              <div className="py-2 px-3 text-center border-b">{t('db.common.notes')}</div>
              <div className="py-2 px-3 text-center border-b">Tap</div>
              <div className="py-2 px-3 text-center border-b">Hold</div>
              <div className="py-2 px-3 text-center border-b">Slide</div>
              {hasTouch && <div className="py-2 px-3 text-center border-b">Touch</div>}
              <div className="py-2 px-3 text-center border-b">Break</div>
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
                {region === "intl" ? t('regions.intl') : t('regions.jp')}
              </h3>
            </div>

            <div className="space-y-3 pl-4 border-l-2 border-muted">
              {versions.map(({ gameVersion, charts }) => {
                const versionInfo = getVersionInfo(gameVersion);

                // Group charts by difficulty to show level changes
                const byDifficulty = new Map<Difficulty, SongExtended[]>();
                charts.forEach(chart => {
                  if (!byDifficulty.has(chart.difficulty)) {
                    byDifficulty.set(chart.difficulty, []);
                  }
                  byDifficulty.get(chart.difficulty)!.push(chart);
                });

                // Sort by difficulty order
                const sortedDifficulties = Array.from(byDifficulty.entries()).sort((a, b) =>
                  difficultyOrder.indexOf(a[0]) - difficultyOrder.indexOf(b[0])
                );

                return (
                  <div key={gameVersion} className="space-y-1">
                    <div className="flex items-center gap-2 text-xs">
                      <Calendar className="w-3 h-3 text-muted-foreground" />
                      <span className="font-medium">{versionInfo?.name ?? `v${gameVersion}`}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pl-5">
                      {sortedDifficulties.map(([difficulty, diffCharts]) => {
                        const chart = diffCharts[0];
                        const colors = DIFFICULTY_COLORS[difficulty] || { bg: "bg-gray-500", text: "text-gray-600", border: "border-gray-500" };
                        return (
                          <div
                            key={difficulty}
                            className={cn(
                              "px-2 py-0.5 rounded text-xs font-medium text-white",
                              colors.bg
                            )}
                          >
                            {t(`common.difficulties.${difficulty}`)} {(chart.levelPrecise / 10).toFixed(1)}
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

