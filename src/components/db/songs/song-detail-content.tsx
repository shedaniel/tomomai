"use client";

import { Loader2, Globe, Calendar, Activity, Pencil, Music } from "lucide-react";
import Image from "next/image";
import { trpc } from "@/lib/trpc-client";
import { cn, createSafeMaimaiImageUrl } from "@/lib/utils";
import { getVersionInfo } from "@/lib/metadata";
import { SongDetails } from "./types";

interface SongDetailContentProps {
  songName: string;
  type: "std" | "dx";
  onClose: () => void;
  initialData?: SongDetails | null;
}

export function SongDetailContent({ songName, type, onClose, initialData }: SongDetailContentProps) {
  const { data: fetchedData, isLoading, error } = trpc.user.getSongDetails.useQuery(
    { songName, type },
    {
      staleTime: 300000,
      enabled: !initialData,
    }
  );

  const data = initialData ?? fetchedData;

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

  const difficultyColors: Record<string, { bg: string; text: string; border: string }> = {
    basic: { bg: "bg-emerald-500", text: "text-emerald-600", border: "border-emerald-500" },
    advanced: { bg: "bg-amber-500", text: "text-amber-600", border: "border-amber-500" },
    expert: { bg: "bg-rose-500", text: "text-rose-600", border: "border-rose-500" },
    master: { bg: "bg-violet-500", text: "text-violet-600", border: "border-violet-500" },
    remaster: { bg: "bg-violet-300", text: "text-violet-500", border: "border-violet-300" },
    utage: { bg: "bg-pink-500", text: "text-pink-600", border: "border-pink-500" },
  };

  const difficultyLabels: Record<string, string> = {
    basic: "BASIC",
    advanced: "ADVANCED",
    expert: "EXPERT",
    master: "MASTER",
    remaster: "Re:MASTER",
    utage: "UTAGE",
  };

  const difficultyOrder = ["basic", "advanced", "expert", "master", "remaster", "utage"];

  // Get the latest version's charts for display (prefer intl, then jp)
  const latestRegion = data.regions.find(r => r.region === "intl") || data.regions[0];
  const latestVersion = latestRegion?.versions[0];
  const latestCharts = latestVersion?.charts ?? [];

  // Sort charts by difficulty order
  const sortedCharts = [...latestCharts].sort((a, b) =>
    difficultyOrder.indexOf(a.difficulty) - difficultyOrder.indexOf(b.difficulty)
  );

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
      {sortedCharts.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Music className="w-4 h-4" />
            Charts
          </h3>

          <div className="border rounded-md overflow-x-auto grid grid-cols-[minmax(100px,1fr)_auto_1fr_1fr_1fr_1fr_1fr]">
            {/* Header Row */}
            <div className="contents text-xs bg-accent/50 font-medium text-muted-foreground">
              <div className="py-2 px-3 border-b">Difficulty</div>
              <div className="py-2 px-3 text-center border-b">Level</div>
              <div className="py-2 px-3 text-center border-b">Notes</div>
              <div className="py-2 px-3 text-center border-b">Tap</div>
              <div className="py-2 px-3 text-center border-b">Hold</div>
              <div className="py-2 px-3 text-center border-b">Slide</div>
              <div className="py-2 px-3 text-center border-b">Break</div>
            </div>

            {/* Chart Rows */}
            {sortedCharts.map((chart, index) => {
              const colors = difficultyColors[chart.difficulty] || { bg: "bg-gray-500", text: "text-gray-600", border: "border-gray-500" };
              const hasNoteData = chart.tapCount !== null;
              const totalNotes = hasNoteData
                ? (chart.tapCount ?? 0) + (chart.holdCount ?? 0) + (chart.slideCount ?? 0) + (chart.touchCount ?? 0) + (chart.breakCount ?? 0)
                : null;
              const isLast = index === sortedCharts.length - 1;
              const hasDesigner = !!chart.noteDesigner;

              // Show border on data row only if there is no designer row following it
              // (and it's not the last row of the table)
              const dataBorderClass = hasDesigner ? "" : (isLast ? "" : "border-b");

              // Show border on designer row unless it's the last row of the table
              const designerBorderClass = isLast ? "" : "border-b";

              return (
                <div key={chart.difficulty} className="contents text-sm">
                  {/* Difficulty */}
                  <div className={cn("py-2.5 px-3 flex items-center gap-2", dataBorderClass)}>
                    <span className={cn("font-bold", colors.text)}>
                      {difficultyLabels[chart.difficulty] || chart.difficulty.toUpperCase()}
                    </span>
                  </div>
                  {/* Level */}
                  <div className={cn("py-2.5 px-3 flex items-baseline justify-center gap-1", dataBorderClass)}>
                    <span className="text-lg font-bold tabular-nums">{chart.level}</span>
                    <span className="text-xs text-muted-foreground">({(chart.levelPrecise / 10).toFixed(1)})</span>
                  </div>
                  {/* Notes */}
                  <div className={cn("py-2.5 px-3 flex items-center justify-center tabular-nums", dataBorderClass)}>
                    {hasNoteData ? totalNotes : "-"}
                  </div>
                  {/* Tap */}
                  <div className={cn("py-2.5 px-3 flex items-center justify-center tabular-nums", dataBorderClass)}>
                    {hasNoteData ? chart.tapCount : "-"}
                  </div>
                  {/* Hold */}
                  <div className={cn("py-2.5 px-3 flex items-center justify-center tabular-nums", dataBorderClass)}>
                    {hasNoteData ? chart.holdCount : "-"}
                  </div>
                  {/* Slide */}
                  <div className={cn("py-2.5 px-3 flex items-center justify-center tabular-nums", dataBorderClass)}>
                    {hasNoteData ? chart.slideCount : "-"}
                  </div>
                  {/* Break */}
                  <div className={cn("py-2.5 px-3 flex items-center justify-center tabular-nums", dataBorderClass)}>
                    {hasNoteData ? chart.breakCount : "-"}
                  </div>

                  {/* Designer row (spans all columns) */}
                  {chart.noteDesigner && (
                    <div className={cn(
                      "col-span-full px-3 pb-2 pt-0 flex items-center gap-1.5 text-xs text-muted-foreground",
                      designerBorderClass
                    )}>
                      <Pencil className="w-3 h-3" />
                      <span>{chart.noteDesigner}</span>
                    </div>
                  )}
                </div>
              );
            })}
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
                const byDifficulty = new Map<string, typeof charts[0][]>();
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
                        const colors = difficultyColors[difficulty] || { bg: "bg-gray-500", text: "text-gray-600", border: "border-gray-500" };
                        return (
                          <div
                            key={difficulty}
                            className={cn(
                              "px-2 py-0.5 rounded text-xs font-medium text-white",
                              colors.bg
                            )}
                          >
                            {difficultyLabels[difficulty] || difficulty.toUpperCase()} {(chart.levelPrecise / 10).toFixed(1)}
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

