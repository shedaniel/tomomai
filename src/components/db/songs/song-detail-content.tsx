"use client";

import { Loader2, Globe, Calendar, Activity, Pencil, Music } from "lucide-react";
import Image from "next/image";
import { trpc } from "@/lib/trpc-client";
import { cn, createSafeMaimaiImageUrl } from "@/lib/utils";
import { getCurrentVersion, getVersionInfo } from "@/lib/metadata";
import { calculateSongRating } from "@/lib/rating-calculator";
import { SongDetails, UserScore } from "./types";
import { REGION_ENUM } from "@/lib/db/types";
import { Difficulty, Region, SongExtended } from "@/lib/types";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ACHIEVEMENTS, getAchievementRate } from "@/lib/difficulty";
import { useMemo, useState } from "react";
import { Tabs, TabsPanels, TabsPanel, TabsTab, TabsList } from "@/components/animate-ui/components/base/tabs";

type SongExtendedIdentified = SongExtended & { region: Region; gameVersion: number };

const DIFFICULTY_COLORS: Record<Difficulty, { bg: string; text: string; border: string }> = {
  basic: { bg: "bg-emerald-500", text: "text-emerald-600", border: "border-emerald-500" },
  advanced: { bg: "bg-amber-500", text: "text-amber-600", border: "border-amber-500" },
  expert: { bg: "bg-rose-500", text: "text-rose-600", border: "border-rose-500" },
  master: { bg: "bg-violet-500", text: "text-violet-600", border: "border-violet-500" },
  remaster: { bg: "bg-violet-300", text: "text-violet-500", border: "border-violet-300" },
  utage: { bg: "bg-pink-500", text: "text-pink-600", border: "border-pink-500" },
};

const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  basic: "BASIC",
  advanced: "ADVANCED",
  expert: "EXPERT",
  master: "MASTER",
  remaster: "Re:MASTER",
  utage: "UTAGE",
};

function getRate(achievement: number, version: number, fc: string) {
  if (version >= 12 && (fc === "ap" || fc === "ap+")) return "SSS+ AP";
  return getAchievementRate(achievement);
}

interface SongDetailContentProps {
  songName: string;
  type: "std" | "dx";
  onClose: () => void;
  initialData?: SongDetails | null;
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

        const label = region === 'intl' ? 'INTL' : 'JP';

        return (
          <div key={region} className="contents">
            <div className="flex flex-col min-w-0">
              <div className="text-[10px] text-muted-foreground font-semibold uppercase mb-0.5 truncate">
                {`${label} Achievement`}
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
                {`${label} Rating`}
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
  const latestChart: SongExtendedIdentified = charts.find(c => c.gameVersion === Math.max(...charts.map(c => c.gameVersion)))!;

  const colors = DIFFICULTY_COLORS[difficulty] || { bg: "bg-gray-500", text: "text-gray-600", border: "border-gray-500" };
  const hasNoteData = latestChart.tapCount !== null;
  const totalNotes = hasNoteData
    ? (latestChart.tapCount ?? 0) + (latestChart.holdCount ?? 0) + (latestChart.slideCount ?? 0) + (latestChart.touchCount ?? 0) + (latestChart.breakCount ?? 0)
    : null;
  const dataBorderClass = index === 0 ? "" : "border-t";

  const chartScores: Record<Region, UserScore> = useMemo(() => {
    return charts.reduce((acc, chart) => {
      const score = data.userScores?.[chart.region]?.[chart.difficulty];
      if (score) {
        acc[chart.region] = score;
      }
      return acc;
    }, {} as Record<Region, UserScore>);
  }, [charts, data.userScores]);

  return (
    <Dialog key={difficulty}>
      <DialogTrigger asChild>
        <div className="contents text-sm group *:group-hover:bg-accent *:transition-colors *:duration-200">
          {/* Difficulty */}
          <div className={cn("py-2.5 px-3 flex items-center gap-2", dataBorderClass)}>
            <span className={cn("font-bold", colors.text)}>
              {DIFFICULTY_LABELS[difficulty] || difficulty.toUpperCase()}
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

          {/* Designer row (spans all columns) */}
          {latestChart.noteDesigner && (
            <div className="col-span-full px-3 pb-2 pt-0 h-7 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Pencil className="w-3 h-3" />
              <span className="font-medium">Chart Designer</span>
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

function SongChartDialogGrid({ chart, score }: { chart: SongExtendedIdentified; score: UserScore }) {
  return (
    <div className="grid grid-cols-[minmax(100px,5fr)_minmax(100px,1fr)] rounded-md overflow-hidden border">
      <div className="contents text-xs bg-accent/50 font-medium text-muted-foreground">
        <div className="py-2 px-3 border-b border-r">Achievement</div>
        <div className="py-2 px-3 border-b">Rating</div>
      </div>
      {chart.gameVersion >= 12 && (<>
        <div className="contents">
          <span className="py-2 px-3 text-xs border-r border-b">
            AP
          </span>
          <span className="py-2 px-3 text-xs border-b font-medium">{Math.floor(calculateSongRating({
            achievement: 1005000,
            fc: "ap",
            fs: "none",
            levelPrecise: chart.levelPrecise,
            addedVersion: chart.addedVersion
          }, chart.gameVersion))}</span>
        </div>
      </>)}
      {ACHIEVEMENTS.map((achievement, index) => (<>
        {score && score.achievement > achievement.achievement && (index === 0 || ACHIEVEMENTS[index - 1].achievement >= score.achievement) && (<>
          <div key={achievement.achievement} className="contents *:bg-primary/80 text-primary-foreground">
            <span className="py-2 px-3 text-xs border-r border-b font-semibold">
              Your Score
              <span className="ml-1.5 text-xs">({(score.achievement / 10000).toFixed(4)}%)</span>
            </span>
            <span className="py-2 px-3 text-xs border-b font-medium">{Math.floor(calculateSongRating({
              achievement: score.achievement,
              fc: "none",
              fs: "none",
              levelPrecise: chart.levelPrecise,
              addedVersion: chart.addedVersion
            }, chart.gameVersion))}</span>
          </div>
        </>)}
        <div key={achievement.achievement} className="contents">
          <span className="py-2 px-3 text-xs border-r border-b">
            {achievement.rate}
            <span className="ml-1.5 text-xs text-muted-foreground">({(achievement.achievement / 10000).toFixed(4)}%)</span>
          </span>
          <span className="py-2 px-3 text-xs border-b font-medium">{Math.floor(calculateSongRating({
            achievement: achievement.achievement,
            fc: "none",
            fs: "none",
            levelPrecise: chart.levelPrecise,
            addedVersion: chart.addedVersion
          }, chart.gameVersion))}</span>
        </div>
      </>
      ))}
    </div>
  )
}

export function SongChartDialogContent({ charts, scores }: { charts: SongExtendedIdentified[]; scores: Record<Region, UserScore> }) {
  const regionsWithScores = Object.keys(scores).filter(region => scores[region as Region] !== undefined);
  const [region, setRegion] = useState<Region>((regionsWithScores[0] ?? charts[0].region) as Region);

  const chart = charts.find(c => c.region === region)!;

  return <>
    <DialogTitle>
      <span className={cn("font-bold mr-2", DIFFICULTY_COLORS[chart.difficulty]?.text ?? "text-gray-600")}>{DIFFICULTY_LABELS[chart.difficulty] || chart.difficulty.toUpperCase()}</span>
      <span className="text-lg font-bold tabular-nums">{chart.level}</span>
      <span className="text-xs">.{chart.levelPrecise % 10}</span>
    </DialogTitle>
    <Tabs value={region} onValueChange={(value) => setRegion(value as Region)}>
      <TabsList className={cn("bg-gray-200 grid w-full grid-cols-2", regionsWithScores.length <= 1 && "hidden")}>
        {charts.map(c => (
          <TabsTab key={c.region} value={c.region}>{c.region}</TabsTab>
        ))}
      </TabsList>

      <TabsPanels>
        {charts.map(c => (
          <TabsPanel key={c.region} value={c.region}>
            <SongChartDialogGrid chart={c} score={scores[c.region]} />
          </TabsPanel>
        ))}
      </TabsPanels>
    </Tabs>
  </>;
}

export function SongDetailContent({ songName, type, initialData }: SongDetailContentProps) {
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
    const record = new Map<Difficulty, SongExtendedIdentified[]>();
    for (const region of (data?.regions ?? [])) {
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
  }, [data?.regions]);

  const allCharts = useMemo(() => {
    return Array.from(chartsByDifficulty.values()).flat();
  }, [chartsByDifficulty]);
  const hasTouch = allCharts.some(chart => chart.touchCount !== null);

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
        <div className="relative w-24 h-24 shrink-0 rounded-lg overflow-hidden ring-2 ring-offset-2 ring-offset-background ring-slate-200">
          <Image
            src={createSafeMaimaiImageUrl(data.cover)}
            alt={data.songName}
            fill
            className="object-cover"
          />
        </div>
        <div className="flex-1 min-w-0 my-auto">
          <h2 className="text-xl font-bold truncate">{data.songName}</h2>
          <p className="text-muted-foreground truncate">{data.artist}</p>
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

      {/* Song Info */}
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {data.bpm && (
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4" />
            <span className="font-medium">BPM</span>
            <span>{data.bpm}</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4" />
          <span className="font-medium">Added</span>
          <span>{addedVersionInfo?.name ?? `Ver. ${data.addedVersion}`}</span>
        </div>
      </div>

      {/* Charts Grid */}
      {chartsByDifficulty.size > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Music className="w-4 h-4" />
            Charts
          </h3>

          <div className={
            cn("border rounded-md overflow-x-auto grid",
              hasTouch ? "grid-cols-[minmax(100px,1fr)_auto_1fr_1fr_1fr_1fr_1fr_1fr]" : "grid-cols-[minmax(100px,1fr)_auto_1fr_1fr_1fr_1fr_1fr]")}>
            {/* Header Row */}
            <div className="contents text-xs bg-accent/50 font-medium text-muted-foreground">
              <div className="py-2 px-3 border-b">Difficulty</div>
              <div className="py-2 px-3 text-center border-b">Level</div>
              <div className="py-2 px-3 text-center border-b">Notes</div>
              <div className="py-2 px-3 text-center border-b">Tap</div>
              <div className="py-2 px-3 text-center border-b">Hold</div>
              <div className="py-2 px-3 text-center border-b">Slide</div>
              {hasTouch && <div className="py-2 px-3 text-center border-b">Touch</div>}
              <div className="py-2 px-3 text-center border-b">Break</div>
            </div>

            {/* Chart Rows */}
            {chartsByDifficulty.entries().map(([difficulty, charts], index) => (
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
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Globe className="w-4 h-4" />
          Availability
        </h3>

        {data.regions.map(({ region, versions }) => (
          <div key={region} className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">
                {region === "intl" ? "International" : "Japan"}
              </span>
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
                            {DIFFICULTY_LABELS[difficulty] || difficulty.toUpperCase()} {(chart.levelPrecise / 10).toFixed(1)}
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

