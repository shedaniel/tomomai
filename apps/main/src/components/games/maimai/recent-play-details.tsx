"use client";

import type { RecentPlay } from "@/lib/trpc-types";
import { cn } from "@/lib/utils";
import { ArrowBigDownDash, ArrowBigUpDash, CloudOff, Grip, MapPin, Slash, Sparkle, Star, TrendingDown, TrendingUp, Trophy } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@tomomai/ui";
import { AutoHeight } from "@/components/animate-ui/primitives/effects/auto-height";
import { ExpandedSongDetails } from "@/components/player/expanded-song-details";
import { calculateDXStars, calculateNoteLosses, distributeBreaks } from "@/lib/games/maimai/score-details";

interface MaimaiRecentPlayDetailsProps {
  play: RecentPlay;
  isExpanded: boolean;
  isDetailed: boolean;
}

export function MaimaiRecentPlayDetails({ play, isExpanded, isDetailed }: MaimaiRecentPlayDetailsProps) {
  const t = useTranslations('recentPlays');

  return (
    <AutoHeight deps={[isExpanded, isDetailed]}>
      <div className={cn(!isExpanded && "max-h-0")}>
        {!isDetailed && (
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
        {isDetailed && (
          <>
            {/* Take up space */}
            <div className="h-6" />

            {/* Detailed Info */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {/* DX Score */}
              <Badge variant="outline" className="flex items-center gap-1 font-medium text-foreground">
                <Sparkle className="h-3 w-3" />
                <span>{t('labels.dx')}</span>
                <span>{(play.secondaryScore ?? 0)}</span>
                <Slash className="h-3 w-3 text-border" />
                <span>{play.maxDxScore}</span>
                <div className="h-3 w-px bg-border mx-1" />
                <span>{calculateDXStars((play.secondaryScore ?? 0), play.maxDxScore)}</span>
                <Star className="h-3 w-3" fill={calculateDXStars((play.secondaryScore ?? 0), play.maxDxScore) > 0 ? "currentColor" : "none"} />
                <div className="h-3 w-px bg-border mx-1" />
                <span>{((play.secondaryScore ?? 0) / play.maxDxScore * 100).toFixed(2)}%</span>
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

              const actualAchievement = play.scoreValue / 10000;

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

            <ExpandedSongDetails publicId={play.songId} />
          </>
        )}
      </div>
    </AutoHeight>
  );
}
