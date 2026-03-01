"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc-client";
import { Region } from "@/lib/types";
import { cn, getTypeBadgeUrl } from "@/lib/utils";
import { Activity, Calendar, ChevronRight, Clock, Loader2, AlertCircle, TrendingUp, TrendingDown, Trophy, FastForward, Rewind, ArrowBigUpDash, ArrowBigDownDash, Grip, Sparkle, MapPin, SeparatorVertical, Slash, Star, Music, CloudOff } from "lucide-react";
import { useTranslations } from "next-intl";

import { CoverImage } from "@/components/cover-image";
import Link from "next/link";
import { useCallback, useState, useEffect, useRef, useMemo } from "react";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { Badge } from "./ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { AutoHeight } from "@/components/animate-ui/primitives/effects/auto-height";
import { getVersionInfo } from "@/lib/metadata";
import { inferRouterOutputs } from "@trpc/server";
import { AppRouter } from "@/server/routers/_app";
import { renderLevelPrecise } from "@/lib/name-utils";
import { calculateDXStars, calculateNoteLosses, distributeBreaks } from "@/lib/score-details";
import { motion } from "motion/react";
import { SPRING_CONFIGS, STAGGER, getTransition } from "@/lib/animation-constants";

interface RecentSongsCardProps {
  region: Region;
  beforeDate?: Date;
  snapshotId?: string;
}

interface RecentSongRowProps {
  play: inferRouterOutputs<AppRouter>['user']['getRecentSongs']['recentPlays'][number];
  index: number;
  isFirst: boolean;
  isLast: boolean;
  onToggleExpand: (id: string) => void;
  isExpanded: boolean;
}

function RecentSongRow({ play, index, isFirst, isLast, onToggleExpand, isExpanded }: RecentSongRowProps) {
  const t = useTranslations('recentPlays');
  const [isRowHovered, setIsRowHovered] = useState(false);
  const isDetailed = play.rating !== null;
  const playDate = new Date(play.playedAt);

  return (
    <motion.div
      key={play.recentSongId}
      onClick={() => onToggleExpand(play.recentSongId.toString())}
      onHoverStart={() => setIsRowHovered(true)}
      onHoverEnd={() => setIsRowHovered(false)}
      className={cn("flex flex-col transition-colors cursor-pointer group",
        isFirst ? "pb-4" : isLast ? "pt-4" : "py-4",
      )}
      initial={{ opacity: 0, scale: 0.95, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={getTransition({
        type: 'spring',
        stiffness: 400,
        damping: 25,
        delay: STAGGER.calculateDelay(index, 0.05, 0.3)
      })}
    >
      <div className="flex gap-4">
        {/* Song Cover */}
        <motion.div
          className="relative shrink-0"
          animate={isRowHovered ? {
            scale: 1.05,
            rotate: 2,
          } : {
            scale: 1,
            rotate: 0,
          }}
          transition={getTransition({ type: 'spring', stiffness: 400, damping: 15 })}
        >
          <CoverImage
            coverUrl={play.cover}
            alt={play.songName}
            className={cn(
              "w-14 h-14 rounded ring-2 ring-offset-2 ring-offset-card object-cover",
              play.difficulty === "basic" && "ring-green-400",
              play.difficulty === "advanced" && "ring-yellow-400",
              play.difficulty === "expert" && "ring-red-400",
              play.difficulty === "master" && "ring-purple-500",
              play.difficulty === "remaster" && "ring-purple-200",
              play.difficulty === "utage" && "ring-pink-400",
            )}
            width={56}
            height={56}
            loading="lazy"
          />
          {/* Difficulty Badge */}
          <div className="absolute top-8 -right-0.5 w-2 h-4 bg-transparent rounded-br-full"
            style={{
              boxShadow: "0 8px 0 0 var(--difficulty-color)",
              // @ts-ignore
              "--difficulty-color": play.difficulty === "basic" ? "var(--color-green-400)"
                : play.difficulty === "advanced" ? "var(--color-yellow-400)"
                  : play.difficulty === "expert" ? "var(--color-red-400)"
                    : play.difficulty === "master" ? "var(--color-purple-500)"
                      : play.difficulty === "remaster" ? "var(--color-purple-200)"
                        : play.difficulty === "utage" ? "var(--color-pink-400)"
                          : "var(--color-white)",
            }} />
          <div
            className={cn(
              "absolute top-12 -right-1 px-1.5 py-0.5 rounded rounded-tr-none rounded-br-[8px] text-xs font-semibold text-white",
              play.difficulty === "basic" && "bg-green-400",
              play.difficulty === "advanced" && "bg-yellow-400",
              play.difficulty === "expert" && "bg-red-400",
              play.difficulty === "master" && "bg-purple-500",
              play.difficulty === "remaster" && "bg-purple-200 text-purple-900",
              play.difficulty === "utage" && "bg-pink-400",
            )}
          >
            {renderLevelPrecise(play.levelPrecise, play.difficulty)}
          </div>
        </motion.div>

        {/* Song Info */}
        <div className="flex-1 min-w-0 self-center">
          <h4 className="font-semibold truncate">
            {play.songName}

            {/* Not fetched indicator */}
            {!isDetailed && (
              <motion.span
                animate={isRowHovered ? {
                  scale: 1.03,
                } : {
                  scale: 1,
                }}
                transition={getTransition({ type: 'spring', stiffness: 500, damping: 20 })}
              >
                <Badge variant="outline" className="ml-2 text-muted-foreground text-xs">
                  <CloudOff className="h-3 w-3 mr-1" />
                  {t('notFetched')}
                </Badge>
              </motion.span>
            )}
          </h4>
          <p className="text-xs text-muted-foreground truncate">
            {play.artist}
          </p>
          <div className="flex items-center gap-1.5 mt-1.5">
            <img
              src={getTypeBadgeUrl(play.type)}
              alt={play.type.toUpperCase()}
              width={32}
              height={10}
              className="h-2.5 w-auto"
            />
            {play.genre && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary text-secondary-foreground font-medium truncate max-w-[120px]">
                {play.genre}
              </span>
            )}
          </div>
        </div>
        <div className="text-right shrink-0 space-y-0.5 flex flex-col items-end justify-between">
          {/* Track and Date at the very top */}
          <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
            <span className="hidden sm:block">{playDate.toLocaleDateString()} {playDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            <motion.div
              animate={isRowHovered ? {
                scale: 1.05,
              } : {
                scale: 1,
              }}
              transition={getTransition({ type: 'spring', stiffness: 500, damping: 20 })}
            >
              <Badge variant="secondary" className="text-xs">
                Track {play.track}
              </Badge>
            </motion.div>
          </div>
          {/* FC/FS badges */}
          {play.fc !== 'none' || play.fs !== 'none' ? (
            <motion.div
              className="text-xs text-muted-foreground"
              animate={isRowHovered ? {
                scale: 1.05,
              } : {
                scale: 1,
              }}
              transition={getTransition({ type: 'spring', stiffness: 500, damping: 20 })}
            >
              {play.fc !== 'none' ? play.fc.toUpperCase() : ''}{' '}
              {play.fs !== 'none' ? play.fs.toUpperCase() : ''}
            </motion.div>
          ) : null}
          {/* Achievement */}
          <motion.div
            className="font-mono text-sm font-semibold"
            animate={isRowHovered ? {
              scale: 1.05,
              color: 'hsl(var(--primary))',
            } : {
              scale: 1,
              color: 'hsl(var(--foreground))',
            }}
            transition={getTransition({ type: 'spring', stiffness: 500, damping: 20 })}
          >
            {(play.achievement / 10000).toFixed(4)}%
          </motion.div>
        </div>
      </div>


      {/* Animated expandable content */}
      <AutoHeight deps={[isExpanded, isDetailed]}>
        {isExpanded && !isDetailed && (
          <>
            {/* Take up space */}
            <div className="h-6" />
            <div className="px-4 rounded-md bg-muted/50 text-center">
              {/* Take up space */}
              <div className="h-6" />

              <CloudOff className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {t('detailsNotFetched')}
              </p>

              {/* Take up space */}
              <div className="h-6" />
            </div>
          </>
        )}
        {isExpanded && isDetailed && (
          <>
            {/* Take up space */}
            <div className="h-6" />

            {/* Detailed Info */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {/* DX Score */}
              <Badge variant="outline" className="flex items-center gap-1 font-medium text-foreground">
                <Sparkle className="h-3 w-3" />
                <span>{t('labels.dx')}</span>
                <span>{play.dxScore}</span>
                <Slash className="h-3 w-3 text-border" />
                <span>{play.maxDxScore}</span>
                <div className="h-3 w-px bg-border mx-1" />
                <span>{calculateDXStars(play.dxScore, play.maxDxScore)}</span>
                <Star className="h-3 w-3" fill={calculateDXStars(play.dxScore, play.maxDxScore) > 0 ? "currentColor" : "none"} />
                <div className="h-3 w-px bg-border mx-1" />
                <span>{(play.dxScore / play.maxDxScore * 100).toFixed(2)}%</span>
              </Badge>

              {/* Rating */}
              {play.rating !== null && (
                <Badge variant="outline" className="flex items-center gap-1 font-medium text-foreground">
                  <Trophy className="h-3 w-3" />
                  {play.rating}
                  {play.ratingChange !== null && play.ratingChange !== 0 && (
                    <span className="ml-1">
                      {play.ratingChange > 0 ? (
                        <TrendingUp className="h-3 w-3 inline mr-1" />
                      ) : (
                        <TrendingDown className="h-3 w-3 inline mr-1" />
                      )}
                      {Math.abs(play.ratingChange)}
                    </span>
                  )}
                </Badge>
              )}

              {/* Combo */}
              {play.combo !== null && (
                <Badge variant="outline" className="flex items-center gap-1 font-medium text-foreground">
                  <Grip className="h-3 w-3" />
                  <span>{t('labels.combo')}</span>
                  <span>{play.combo}</span>
                  <Slash className="h-3 w-3 text-border" />
                  <span>{play.maxCombo}</span>
                </Badge>
              )}

              {/* Fast/Late */}
              {(play.fastCount !== null || play.lateCount !== null) && (<>
                <Badge variant="outline" className="flex items-center gap-1 font-medium text-foreground">
                  <ArrowBigUpDash className="h-3.5 w-3.5" />
                  <span>{t('labels.fast')}</span>
                  <span>{play.fastCount ?? 0}</span>
                  <div className="h-3 w-px bg-border mx-1" />
                  <ArrowBigDownDash className="h-3.5 w-3.5" />
                  <span>{t('labels.late')}</span>
                  <span>{play.lateCount ?? 0}</span>
                </Badge>
              </>)}

              {/* Venue (JP only) */}
              {play.venue && (
                <Badge variant="outline" className="flex items-center gap-1 font-medium text-foreground">
                  <MapPin className="h-3 w-3" />
                  <span>{play.venue}</span>
                </Badge>
              )}
            </div>

            {/* Notes breakdown grid */}
            {play.tapCPerfect !== null && (() => {
              const notes = {
                tap: {
                  criticalPerfect: play.tapCPerfect ?? 0,
                  perfect: play.tapPerfect ?? 0,
                  great: play.tapGreat ?? 0,
                  good: play.tapGood ?? 0,
                  miss: play.tapMiss ?? 0,
                },
                hold: {
                  criticalPerfect: play.holdCPerfect ?? 0,
                  perfect: play.holdPerfect ?? 0,
                  great: play.holdGreat ?? 0,
                  good: play.holdGood ?? 0,
                  miss: play.holdMiss ?? 0,
                },
                slide: {
                  criticalPerfect: play.slideCPerfect ?? 0,
                  perfect: play.slidePerfect ?? 0,
                  great: play.slideGreat ?? 0,
                  good: play.slideGood ?? 0,
                  miss: play.slideMiss ?? 0,
                },
                touch: {
                  criticalPerfect: play.touchCPerfect ?? 0,
                  perfect: play.touchPerfect ?? 0,
                  great: play.touchGreat ?? 0,
                  good: play.touchGood ?? 0,
                  miss: play.touchMiss ?? 0,
                },
                break: {
                  criticalPerfect: play.breakCPerfect ?? 0,
                  perfect: play.breakPerfect ?? 0,
                  great: play.breakGreat ?? 0,
                  good: play.breakGood ?? 0,
                  miss: play.breakMiss ?? 0,
                },
              };

              const actualAchievement = play.achievement / 10000;

              const breakDist = distributeBreaks(
                notes,
                actualAchievement,
                play.breakPerfect ?? 0,
                play.breakGreat ?? 0
              );

              const losses = calculateNoteLosses(notes, breakDist);

              return (
                <div className="mt-3 overflow-x-auto">
                  <div className="grid grid-cols-[auto_1fr_1fr_1fr_1fr_1fr_1fr_1fr] max-sm:grid-cols-[auto_1fr_1fr_1fr_1fr_1fr_1fr] text-sm max-sm:text-2xs max-md:text-xs min-w-fit border rounded-md">
                    {/* Header Row */}
                    <div className="text-center py-1 pl-4 pr-2 font-medium text-muted-foreground bg-accent/50 border-b border-r flex items-center justify-end">{t('notesBreakdown.type')}</div>
                    <div className="text-center py-1 px-2 font-medium text-muted-foreground bg-accent/50 border-b border-r flex items-center justify-center max-sm:hidden">{t('notesBreakdown.total')}</div>
                    <div className="text-center py-1 px-2 font-medium text-muted-foreground bg-accent/50 border-b border-r flex items-center justify-center gap-1">
                      Critical Perfect
                    </div>
                    <div className="text-center py-1 px-2 font-medium text-muted-foreground bg-accent/50 border-b border-r flex items-center justify-center gap-1">
                      Perfect
                    </div>
                    <div className="text-center py-1 px-2 font-medium text-muted-foreground bg-accent/50 border-b border-r flex items-center justify-center gap-1">
                      Great
                    </div>
                    <div className="text-center py-1 px-2 font-medium text-muted-foreground bg-accent/50 border-b border-r flex items-center justify-center gap-1">
                      Good
                    </div>
                    <div className="text-center py-1 px-2 font-medium text-muted-foreground bg-accent/50 border-b border-r flex items-center justify-center gap-1">
                      Miss
                    </div>
                    <div className="text-center py-1 px-2 font-medium text-muted-foreground bg-accent/50 border-b flex items-center justify-center">
                      {t('notesBreakdown.totalLoss')}
                    </div>

                    {/* Tap Row */}
                    <div className="text-right py-1 pl-4 pr-2 font-medium border-b border-r">Tap</div>
                    <div className="text-center py-1 px-2 border-b border-r max-sm:hidden">
                      {(play.tapCPerfect ?? 0) + (play.tapPerfect ?? 0) + (play.tapGreat ?? 0) + (play.tapGood ?? 0) + (play.tapMiss ?? 0)}
                    </div>
                    <div className="text-center bg-yellow-50 dark:bg-yellow-600/30 text-yellow-600 dark:text-yellow-400 py-1 px-2 border-b border-r">
                      {play.tapCPerfect ?? 0}
                    </div>
                    <div className="text-center bg-orange-50 dark:bg-orange-600/30 text-orange-600 dark:text-orange-400 py-1 px-2 border-b border-r">
                      {play.tapPerfect ?? 0}
                    </div>
                    <div className="text-center bg-pink-50 dark:bg-pink-600/30 text-pink-600 dark:text-pink-400 py-1 px-2 border-b border-r flex flex-col items-center">
                      <div>{play.tapGreat ?? 0}</div>
                      <div className="text-xs max-sm:text-[8px] text-pink-500 dark:text-pink-400">(-{losses.tap.great.toFixed(4)}%)</div>
                    </div>
                    <div className="text-center bg-green-50 dark:bg-green-600/30 text-green-600 dark:text-green-400 py-1 px-2 border-b border-r flex flex-col items-center">
                      <div>{play.tapGood ?? 0}</div>
                      <div className="text-xs max-sm:text-[8px] text-green-500 dark:text-green-400">(-{losses.tap.good.toFixed(4)}%)</div>
                    </div>
                    <div className="text-center bg-neutral-50 dark:bg-neutral-600/30 text-neutral-600 dark:text-neutral-400 py-1 px-2 border-b border-r flex flex-col items-center">
                      <div>{play.tapMiss ?? 0}</div>
                      <div className="text-xs max-sm:text-[8px] text-neutral-500 dark:text-neutral-400">(-{losses.tap.miss.toFixed(4)}%)</div>
                    </div>
                    <div className="text-center py-1 px-2 border-b font-medium text-muted-foreground flex items-center justify-center max-sm:text-2xs">
                      -{(losses.tap.great + losses.tap.good + losses.tap.miss).toFixed(4)}%
                    </div>

                    {/* Hold Row */}
                    <div className="text-right py-1 pl-4 pr-2 font-medium border-b border-r">Hold</div>
                    <div className="text-center py-1 px-2 border-b border-r max-sm:hidden">
                      {(play.holdCPerfect ?? 0) + (play.holdPerfect ?? 0) + (play.holdGreat ?? 0) + (play.holdGood ?? 0) + (play.holdMiss ?? 0)}
                    </div>
                    <div className="text-center bg-yellow-50 dark:bg-yellow-600/30 text-yellow-600 dark:text-yellow-400 py-1 px-2 border-b border-r">
                      {play.holdCPerfect ?? 0}
                    </div>
                    <div className="text-center bg-orange-50 dark:bg-orange-600/30 text-orange-600 dark:text-orange-400 py-1 px-2 border-b border-r">
                      {play.holdPerfect ?? 0}
                    </div>
                    <div className="text-center bg-pink-50 dark:bg-pink-600/30 text-pink-600 dark:text-pink-400 py-1 px-2 border-b border-r flex flex-col items-center">
                      <div>{play.holdGreat ?? 0}</div>
                      <div className="text-xs max-sm:text-[8px] text-pink-500 dark:text-pink-400">(-{losses.hold.great.toFixed(4)}%)</div>
                    </div>
                    <div className="text-center bg-green-50 dark:bg-green-600/30 text-green-600 dark:text-green-400 py-1 px-2 border-b border-r flex flex-col items-center">
                      <div>{play.holdGood ?? 0}</div>
                      <div className="text-xs max-sm:text-[8px] text-green-500 dark:text-green-400">(-{losses.hold.good.toFixed(4)}%)</div>
                    </div>
                    <div className="text-center bg-neutral-50 dark:bg-neutral-600/30 text-neutral-600 dark:text-neutral-400 py-1 px-2 border-b border-r flex flex-col items-center">
                      <div>{play.holdMiss ?? 0}</div>
                      <div className="text-xs max-sm:text-[8px] text-neutral-500 dark:text-neutral-400">(-{losses.hold.miss.toFixed(4)}%)</div>
                    </div>
                    <div className="text-center py-1 px-2 border-b font-medium text-muted-foreground flex items-center justify-center max-sm:text-2xs">
                      -{(losses.hold.great + losses.hold.good + losses.hold.miss).toFixed(4)}%
                    </div>

                    {/* Slide Row */}
                    <div className="text-right py-1 pl-4 pr-2 font-medium border-b border-r">Slide</div>
                    <div className="text-center py-1 px-2 border-b border-r max-sm:hidden">
                      {(play.slideCPerfect ?? 0) + (play.slidePerfect ?? 0) + (play.slideGreat ?? 0) + (play.slideGood ?? 0) + (play.slideMiss ?? 0)}
                    </div>
                    <div className="text-center bg-yellow-50 dark:bg-yellow-600/30 text-yellow-600 dark:text-yellow-400 py-1 px-2 border-b border-r">
                      {play.slideCPerfect ?? 0}
                    </div>
                    <div className="text-center bg-orange-50 dark:bg-orange-600/30 text-orange-600 dark:text-orange-400 py-1 px-2 border-b border-r">
                      {play.slidePerfect ?? 0}
                    </div>
                    <div className="text-center bg-pink-50 dark:bg-pink-600/30 text-pink-600 dark:text-pink-400 py-1 px-2 border-b border-r flex flex-col items-center">
                      <div>{play.slideGreat ?? 0}</div>
                      <div className="text-xs max-sm:text-[8px] text-pink-500 dark:text-pink-400">(-{losses.slide.great.toFixed(4)}%)</div>
                    </div>
                    <div className="text-center bg-green-50 dark:bg-green-600/30 text-green-600 dark:text-green-400 py-1 px-2 border-b border-r flex flex-col items-center">
                      <div>{play.slideGood ?? 0}</div>
                      <div className="text-xs max-sm:text-[8px] text-green-500 dark:text-green-400">(-{losses.slide.good.toFixed(4)}%)</div>
                    </div>
                    <div className="text-center bg-neutral-50 dark:bg-neutral-600/30 text-neutral-600 dark:text-neutral-400 py-1 px-2 border-b border-r flex flex-col items-center">
                      <div>{play.slideMiss ?? 0}</div>
                      <div className="text-xs max-sm:text-[8px] text-neutral-500 dark:text-neutral-400">(-{losses.slide.miss.toFixed(4)}%)</div>
                    </div>
                    <div className="text-center py-1 px-2 border-b font-medium text-muted-foreground flex items-center justify-center max-sm:text-2xs">
                      -{(losses.slide.great + losses.slide.good + losses.slide.miss).toFixed(4)}%
                    </div>

                    {/* Touch Row */}
                    <div className="text-right py-1 pl-4 pr-2 font-medium border-b border-r">Touch</div>
                    <div className="text-center py-1 px-2 border-b border-r max-sm:hidden">
                      {(play.touchCPerfect ?? 0) + (play.touchPerfect ?? 0) + (play.touchGreat ?? 0) + (play.touchGood ?? 0) + (play.touchMiss ?? 0)}
                    </div>
                    <div className="text-center bg-yellow-50 dark:bg-yellow-600/30 text-yellow-600 dark:text-yellow-400 py-1 px-2 border-b border-r">
                      {play.touchCPerfect ?? 0}
                    </div>
                    <div className="text-center bg-orange-50 dark:bg-orange-600/30 text-orange-600 dark:text-orange-400 py-1 px-2 border-b border-r">
                      {play.touchPerfect ?? 0}
                    </div>
                    <div className="text-center bg-pink-50 dark:bg-pink-600/30 text-pink-600 dark:text-pink-400 py-1 px-2 border-b border-r flex flex-col items-center">
                      <div>{play.touchGreat ?? 0}</div>
                      <div className="text-xs max-sm:text-[8px] text-pink-500 dark:text-pink-400">(-{losses.touch.great.toFixed(4)}%)</div>
                    </div>
                    <div className="text-center bg-green-50 dark:bg-green-600/30 text-green-600 dark:text-green-400 py-1 px-2 border-b border-r flex flex-col items-center">
                      <div>{play.touchGood ?? 0}</div>
                      <div className="text-xs max-sm:text-[8px] text-green-500 dark:text-green-400">(-{losses.touch.good.toFixed(4)}%)</div>
                    </div>
                    <div className="text-center bg-neutral-50 dark:bg-neutral-600/30 text-neutral-600 dark:text-neutral-400 py-1 px-2 border-b border-r flex flex-col items-center">
                      <div>{play.touchMiss ?? 0}</div>
                      <div className="text-xs max-sm:text-[8px] text-neutral-500 dark:text-neutral-400">(-{losses.touch.miss.toFixed(4)}%)</div>
                    </div>
                    <div className="text-center py-1 px-2 border-b font-medium text-muted-foreground flex items-center justify-center max-sm:text-2xs">
                      -{(losses.touch.great + losses.touch.good + losses.touch.miss).toFixed(4)}%
                    </div>

                    {/* Break Row */}
                    <div className="text-right py-1 pl-4 pr-2 font-medium border-r">Break</div>
                    <div className="text-center py-1 px-2 border-r max-sm:hidden">
                      {(play.breakCPerfect ?? 0) + (play.breakPerfect ?? 0) + (play.breakGreat ?? 0) + (play.breakGood ?? 0) + (play.breakMiss ?? 0)}
                    </div>
                    <div className="text-center bg-yellow-50 dark:bg-yellow-600/30 text-yellow-600 dark:text-yellow-400 py-1 px-2 border-r">
                      {play.breakCPerfect ?? 0}
                    </div>
                    <div className="text-center bg-orange-50 dark:bg-orange-600/30 text-orange-600 dark:text-orange-400 py-1 px-2 border-r flex flex-col items-center">
                      <div>{breakDist.perfect2550}-{breakDist.perfect2500}</div>
                      <div className="text-xs max-sm:text-[8px] text-orange-500 dark:text-orange-400">(-{losses.break.perfect.toFixed(4)}%)</div>
                    </div>
                    <div className="text-center bg-pink-50 dark:bg-pink-600/30 text-pink-600 dark:text-pink-400 py-1 px-2 border-r flex flex-col items-center">
                      <div>{breakDist.great2000}-{breakDist.great1500}-{breakDist.great1250}</div>
                      <div className="text-xs max-sm:text-[8px] text-pink-500 dark:text-pink-400">(-{losses.break.great.toFixed(4)}%)</div>
                    </div>
                    <div className="text-center bg-green-50 dark:bg-green-600/30 text-green-600 dark:text-green-400 py-1 px-2 border-r flex flex-col items-center">
                      <div>{play.breakGood ?? 0}</div>
                      <div className="text-xs max-sm:text-[8px] text-green-500 dark:text-green-400">(-{losses.break.good.toFixed(4)}%)</div>
                    </div>
                    <div className="text-center bg-neutral-50 dark:bg-neutral-600/30 text-neutral-600 dark:text-neutral-400 py-1 px-2 border-r flex flex-col items-center">
                      <div>{play.breakMiss ?? 0}</div>
                      <div className="text-xs max-sm:text-[8px] text-neutral-500 dark:text-neutral-400">(-{losses.break.miss.toFixed(4)}%)</div>
                    </div>
                    <div className="text-center py-1 px-2 font-medium text-muted-foreground flex items-center justify-center max-sm:text-2xs">
                      -{(losses.break.perfect + losses.break.great + losses.break.good + losses.break.miss).toFixed(4)}%
                    </div>
                  </div>
                </div>
              );
            })()}

            <ExpandedSongDetails publicId={play.songPublicId} />
          </>
        )}
      </AutoHeight>
    </motion.div>
  );
}

export function RecentSongsCard({ region, beforeDate, snapshotId }: RecentSongsCardProps) {
  const t = useTranslations('recentPlays');
  const [allPlays, setAllPlays] = useState<inferRouterOutputs<AppRouter>['user']['getRecentSongs']['recentPlays']>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const limit = 25;

  // Track which offsets have been processed to prevent duplicates
  const processedOffsetsRef = useRef<Set<number>>(new Set());

  const { data: ownData, isLoading: ownLoading, isFetching: ownFetching, error: ownError } = trpc.user.getRecentSongs.useQuery(
    { region, limit, offset, beforeDate },
    { enabled: !snapshotId }
  );
  const { data: publicData, isLoading: publicLoading, isFetching: publicFetching, error: publicError } = trpc.user.getPublicRecentSongs.useQuery(
    { snapshotId: snapshotId!, region, limit, offset, beforeDate },
    { enabled: !!snapshotId }
  );
  const data = snapshotId ? publicData : ownData;
  const isLoading = snapshotId ? publicLoading : ownLoading;
  const isFetching = snapshotId ? publicFetching : ownFetching;
  const error = snapshotId ? publicError : ownError;

  // Reset pagination state when region or beforeDate changes
  useEffect(() => {
    setOffset(0);
    setAllPlays([]);
    setHasMore(false);
    processedOffsetsRef.current = new Set();
  }, [region, beforeDate]);

  // Update allPlays when new data arrives
  // Use isFetching (not isLoading) to prevent processing stale data during query transitions
  // isFetching is true whenever a query is in flight, even if there's cached data
  useEffect(() => {
    if (data && !isFetching && !processedOffsetsRef.current.has(offset)) {
      processedOffsetsRef.current.add(offset);
      if (offset === 0) {
        setAllPlays(data.recentPlays);
      } else {
        setAllPlays(prev => [...prev, ...data.recentPlays]);
      }
      setHasMore(data.hasMore);
    }
  }, [data, offset, isFetching]);

  const loadMore = useCallback(() => {
    console.log('loadMore', hasMore, isFetching);
    if (hasMore && !isFetching) {
      setOffset(prev => prev + limit);
    }
  }, [hasMore, isFetching]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  }, []);

  const sentinelRef = useInfiniteScroll(loadMore, hasMore && !isFetching);

  if (isLoading && offset === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            {t('title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            {t('title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <AlertCircle className="h-5 w-5 mr-2" />
            <span>{t('noPlays')}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Only show "no plays" after we've actually processed the initial data
  // This prevents returning early before the data effect runs,
  // which would prevent the sentinel from being rendered
  if (allPlays.length === 0 && !isLoading && processedOffsetsRef.current.has(0)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            {t('title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <span>{t('noPlays')}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            {t('title')}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="divide-y divide-border divide-dashed">
          {allPlays.map((play, i) => (
            <RecentSongRow
              key={play.recentSongId}
              play={play}
              index={i}
              isFirst={i === 0}
              isLast={i === allPlays.length - 1}
              onToggleExpand={toggleExpand}
              isExpanded={expandedIds.has(play.recentSongId.toString())}
            />
          ))}

          {/* Infinite scroll sentinel */}
          {hasMore && (
            <div ref={sentinelRef} className="flex justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ExpandedSongDetails({ publicId }: { publicId: string }) {
  const t = useTranslations();
  const { data: songDetails, isLoading } = trpc.user.getSimpleSongDetails.useQuery(
    { publicId },
    {
      staleTime: 1000 * 60 * 60, // 1 hour
    }
  );

  const addedVersionInfo = songDetails ? getVersionInfo(songDetails.addedVersion) : null;

  return (
    <div className="mt-4 flex flex-col gap-3">
      <Separator />
      <div className="grid grid-cols-[auto_1fr] gap-4 text-xs">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Activity className="w-4 h-4" />
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
          <Calendar className="w-4 h-4" />
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

      <motion.div
        whileHover={{ scale: 1.02, y: -2 }}
        whileTap={{ scale: 0.98 }}
        transition={getTransition(SPRING_CONFIGS.snappy)}
      >
        <Button
          className="w-full h-9 text-xs"
          variant="secondary"
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
          <span className="text-destructive">Error</span>
        )}
      </Button>
      </motion.div>
    </div>
  );
}
