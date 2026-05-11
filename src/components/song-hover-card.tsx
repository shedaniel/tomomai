"use client";

import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/animate-ui/components/radix/hover-card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { getVersionInfo } from "@/lib/metadata";
import { trpc } from "@/lib/trpc-client";
import { cn, createSafeMaimaiImageUrl, getTypeBadgeUrl } from "@/lib/utils";
import { Activity, Calendar, ChevronRight, ListPlus, Loader2, Music } from "lucide-react";
import { useTranslations } from "next-intl";

import { CoverImage } from "@/components/cover-image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { DialogTrigger } from "./ui/dialog";
import { AnimatedDialog, AnimatedDialogContent } from "./ui/animated-dialog";
import { SongChartDialogContent } from "./db/songs/song-detail-dialog";
import { Difficulty, MinimalSong, Region, SongType } from "@/lib/types";
import { getChartsByDifficulty, getChartScores } from "./db/songs/song-detail-content";
import { UserScore } from "./db/songs/types";
import { useMediaQuery } from "@/hooks/use-media-query";
import { Drawer, DrawerContent, DrawerTrigger, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";

// achievement ×10000 thresholds for grade boundaries
const TIER_BANDS = [
  { x1: 0, x2: 970000, fill: "#94a3b8" }, // < 97%
  { x1: 970000, x2: 980000, fill: "#f59e0b" }, // S
  { x1: 980000, x2: 990000, fill: "#38bdf8" }, // S+
  { x1: 990000, x2: 1000000, fill: "#facc15" }, // SS / SS+
  { x1: 1000000, x2: 1005000, fill: "#4ade80" }, // SSS
  { x1: 1005000, x2: 1100000, fill: "#c084fc" }, // SSS+
] as const;

const TIER_TICKS = [970000, 980000, 990000, 1000000, 1005000, 1010000];
const TIER_TICK_LABELS: Record<number, string> = {
  970000: "97%",
  980000: "98%",
  990000: "99%",
  1000000: "100%",
  1005000: "100.5%",
  1010000: "101%",
};

/** Compute horizontal gradient stops with sharp transitions at tier boundaries. */
function buildTierGradient(minLo: number, maxLo: number) {
  const range = maxLo - minLo;
  const stops: { offset: string; color: string }[] = [];
  for (const band of TIER_BANDS) {
    const s = range > 0 ? (band.x1 - minLo) / range : 0;
    const e = range > 0 ? (band.x2 - minLo) / range : 1;
    if (e <= 0 || s >= 1) continue;
    const cs = Math.max(0, s);
    const ce = Math.min(1, e);
    stops.push({ offset: `${(cs * 100).toFixed(2)}%`, color: band.fill });
    stops.push({ offset: `${(ce * 100).toFixed(2)}%`, color: band.fill });
  }
  if (!stops.length) {
    const color = (TIER_BANDS.find(b => minLo >= b.x1 && minLo < b.x2) ?? TIER_BANDS[0]).fill;
    return [{ offset: "0%", color }, { offset: "100%", color }];
  }
  return stops;
}

interface SongHoverCardProps {
  children: React.ReactNode;
  song: MinimalSong;
  percentile?: {
    percentile: number;
    peerCount: number;
    userAchievement: number;
    distribution: { lo: number; count: number }[];
  } | null;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
}

function SongDetailDialog({ songName, type, difficulty }: {
  songName: string;
  type: SongType;
  difficulty: Difficulty;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);

  const { data: songDetails, isLoading } = trpc.user.getSongDetails.useQuery(
    {
      songName,
      type,
    },
    {
      enabled: open,
      staleTime: 1000 * 60 * 60, // 1 hour
    }
  );

  const chartsMap = useMemo(() => {
    return getChartsByDifficulty(songDetails?.regions ?? []);
  }, [songDetails?.regions]);
  const charts = useMemo(() => {
    return chartsMap.get(difficulty) ?? [];
  }, [chartsMap, difficulty]);
  const chartScores: Record<Region, UserScore> = useMemo(() => {
    return getChartScores(charts, songDetails?.userScores);
  }, [charts, songDetails?.userScores]);

  return (
    <AnimatedDialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          className="w-full h-8 text-xs"
          variant="outline"
        >
          <ListPlus className="w-3.5 h-3.5 mr-2" />
          {t('db.songs.detail.viewCharts')}
        </Button>
      </DialogTrigger>
      <AnimatedDialogContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <SongChartDialogContent charts={charts} scores={chartScores} />
        )}
      </AnimatedDialogContent>
    </AnimatedDialog>
  )
}

function SongCardContent({
  song,
  songDetails,
  isLoading,
  addedVersionInfo,
  t,
  percentile,
}: {
  song: SongHoverCardProps['song'],
  songDetails: any,
  isLoading: boolean,
  addedVersionInfo: any,
  t: any,
  percentile?: SongHoverCardProps['percentile'],
}) {
  return (
    <div className="p-4 space-y-3">
      {/* Header */}
      <div className="flex gap-3">
        <div className="relative w-16 h-16 shrink-0 rounded-md overflow-hidden ring-1 ring-border">
          <CoverImage
            coverUrl={song.cover}
            alt={song.songName}
            fill
            className="object-cover"
          />
        </div>
        <div className="flex-1 min-w-0 py-0.5">
          <h4 className="font-bold text-sm leading-tight line-clamp-2 mb-1">
            {song.songName}
          </h4>
          <p className="text-xs text-muted-foreground truncate">
            {song.artist}
          </p>
          <div className="flex items-center gap-1.5 mt-1.5 h-5">
            <img
              src={createSafeMaimaiImageUrl(getTypeBadgeUrl(song.type))}
              alt={song.type.toUpperCase()}
              width={32}
              height={10}
              className="h-2.5 w-auto"
            />
            {songDetails?.genre && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary text-secondary-foreground font-medium truncate max-w-[120px]">
                {songDetails.genre}
              </span>
            )}
          </div>
        </div>
      </div>

      <Separator />

      {/* Stats */}
      <div className="grid grid-cols-[auto_1fr] gap-2 text-xs">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Activity className="w-3.5 h-3.5" />
          <span>{t('db.songs.detail.bpm')}</span>
        </div>
        <div className="font-medium text-right">
          {isLoading ? (
            <div className="h-4 w-8 bg-muted animate-pulse rounded ml-auto" />
          ) : (
            songDetails?.bpm ?? "-"
          )}
        </div>

        <div className="flex items-center gap-2 text-muted-foreground">
          <Calendar className="w-3.5 h-3.5" />
          <span>{t('db.songs.detail.added')}</span>
        </div>
        <div className="font-medium text-right truncate">
          {isLoading ? (
            <div className="h-4 w-16 bg-muted animate-pulse rounded ml-auto" />
          ) : (
            addedVersionInfo?.name ?? (songDetails?.addedVersion ? `Ver. ${songDetails.addedVersion}` : "-")
          )}
        </div>
      </div>

      {/* Percentile distribution chart */}
      {percentile && (() => {
        const pct = percentile.percentile;
        let labelText: string;
        let labelColor: string;
        if (pct >= 0.6) {
          const topPct = Math.round((1 - pct) * 100);
          labelText = `Top ${topPct}%`;
          labelColor = topPct <= 10 ? "text-yellow-500" : "text-green-500";
        } else if (pct >= 0.4) {
          labelText = "About Average";
          labelColor = "text-muted-foreground";
        } else {
          labelText = `Bottom ${Math.round(pct * 100)}%`;
          labelColor = "text-red-400";
        }
        const dist = percentile.distribution;
        const minLo = dist[0]?.lo ?? percentile.userAchievement;
        const maxLo = dist[dist.length - 1]?.lo ?? percentile.userAchievement;
        const clampedX = Math.max(minLo, Math.min(maxLo, percentile.userAchievement));
        // Extend to the nearest tier tick ≤ minLo and always to 101% on the right
        const leftEdge = Math.max(940000, Math.min(970000, minLo));
        const rightEdge = 1010000;

        // "dataMin"/"dataMax" domain detection produces the correct axis extent.
        const paddedDist: { lo: number; count: number }[] = [
          { lo: leftEdge, count: 0 },
          { lo: Math.max(leftEdge, minLo - 2000), count: 0 },
          ...dist.filter(d => d.lo >= leftEdge && d.lo <= rightEdge),
          { lo: Math.min(rightEdge, maxLo + 2000), count: 0 },
          { lo: rightEdge, count: 0 },
        ];

        const tierStops = buildTierGradient(leftEdge, rightEdge);
        return (
          <>
            <Separator />
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Among peers</span>
                <span className={cn("font-semibold tabular-nums", labelColor)}>
                  {labelText}
                </span>
              </div>
              <div className="w-full h-30 -mx-0.5">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={paddedDist} margin={{ top: 4, right: 2, left: 2, bottom: 8 }}>
                    <defs>
                      <linearGradient id="tierGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                        {tierStops.map((s, i) => (
                          <stop key={i} offset={s.offset} stopColor={s.color} />
                        ))}
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="lo"
                      type="number"
                      domain={["dataMin", "dataMax"]}
                      ticks={TIER_TICKS.filter(t => t > leftEdge)}
                      interval={0}
                      tick={({ x, y, payload }: any) => (
                        <g transform={`translate(${x},${y})`}>
                          <text
                            x={0} y={0} dy={4}
                            textAnchor="end"
                            transform="rotate(-40)"
                            style={{ fill: "var(--muted-foreground)", fontSize: 8 }}
                          >
                            {TIER_TICK_LABELS[payload.value as number] ?? ""}
                          </text>
                        </g>
                      )}
                      axisLine={false}
                      tickLine={false}
                      height={20}
                    />
                    <YAxis hide />
                    <Area
                      type="monotone"
                      dataKey="count"
                      stroke="url(#tierGrad)"
                      strokeWidth={1.5}
                      fill="url(#tierGrad)"
                      fillOpacity={0.25}
                      dot={false}
                      isAnimationActive={false}
                    />
                    <ReferenceLine
                      x={clampedX}
                      stroke={`var(--color-${labelColor.replace('text-', '')})`}
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <p className="text-[10px] text-muted-foreground text-right">
                out of {percentile.peerCount} similarly rated players
              </p>
            </div>
          </>
        );
      })()}

      {/* Action */}
      <div className="pt-1 flex items-center gap-2 flex-col">
        <SongDetailDialog songName={song.songName} type={song.type} difficulty={song.difficulty} />
        <Button
          className="w-full h-8 text-xs"
          variant="default"
          disabled={isLoading || !songDetails?.slug}
          asChild={!isLoading && !!songDetails?.slug}
        >
          {isLoading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
              {t('common.loading')}
            </>
          ) : songDetails?.slug ? (
            <Link href={`/db/songs/${songDetails.slug}`} target="_blank" className="relative">
              <Music className="w-3.5 h-3.5 mr-2" />
              {t('db.songs.detail.viewDetails')}
              <ChevronRight className="w-3.5 absolute top-0 bottom-0 right-2 my-auto" />
            </Link>
          ) : (
            <span className="text-red-500">Error</span>
          )}
        </Button>
      </div>
    </div>
  );
}

export function SongHoverCard({ children, song, percentile, side, className }: SongHoverCardProps) {
  const t = useTranslations();
  const [isOpen, setIsOpen] = useState(false);
  const isDesktop = useMediaQuery("(min-width: 768px)", { initializeWithValue: false });

  const { data: songDetails, isLoading } = trpc.user.getSimpleSongDetails.useQuery(
    {
      publicId: song.songId,
    },
    {
      enabled: isOpen,
      staleTime: 1000 * 60 * 60, // 1 hour
    }
  );

  const addedVersionInfo = songDetails ? getVersionInfo(songDetails.addedVersion) : null;

  const content = (
    <SongCardContent
      song={song}
      songDetails={songDetails}
      isLoading={isLoading}
      addedVersionInfo={addedVersionInfo}
      t={t}
      percentile={percentile}
    />
  );

  if (isDesktop) {
    return (
      <HoverCard openDelay={100} closeDelay={50} onOpenChange={setIsOpen}>
        <HoverCardTrigger asChild>
          {children}
        </HoverCardTrigger>
        <HoverCardContent className={cn("w-80 p-0 overflow-hidden", className)} align="start" sideOffset={8} side={side}>
          {content}
        </HoverCardContent>
      </HoverCard>
    );
  }

  return (
    <Drawer open={isOpen} onOpenChange={setIsOpen}>
      <DrawerTrigger asChild>
        {children}
      </DrawerTrigger>
      <DrawerContent className="bg-card">
        <DrawerHeader className="text-left pb-1">
          <DrawerTitle>{t('db.songs.detail.title')}</DrawerTitle>
          <DrawerDescription className="hidden">
            {song.songName}
          </DrawerDescription>
        </DrawerHeader>
        <div className="px-2 pb-8">
          {content}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
