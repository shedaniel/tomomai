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
import { DialogTrigger } from "./ui/dialog";
import { AnimatedDialog, AnimatedDialogContent } from "./ui/animated-dialog";
import { SongChartDialogContent } from "./db/songs/song-detail-dialog";
import { Difficulty, MinimalSong, Region, SongType } from "@/lib/types";
import { getChartsByDifficulty, getChartScores } from "./db/songs/song-detail-content";
import { UserScore } from "./db/songs/types";
import { useMediaQuery } from "@/hooks/use-media-query";
import { Drawer, DrawerContent, DrawerTrigger, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";

interface SongHoverCardProps {
  children: React.ReactNode;
  song: MinimalSong;
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
  t
}: {
  song: SongHoverCardProps['song'],
  songDetails: any,
  isLoading: boolean,
  addedVersionInfo: any,
  t: any
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

export function SongHoverCard({ children, song, side, className }: SongHoverCardProps) {
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
