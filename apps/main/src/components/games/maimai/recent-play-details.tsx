"use client";

import { Fragment } from "react";
import { ArrowBigDownDash, ArrowBigUpDash, Grip, MapPin, Slash, Sparkle, Star, TrendingDown, TrendingUp, Trophy } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@tomomai/ui";
import type { RecentDetailsProps } from "@/components/games/registry";
import { playlogNoteCounts } from "@/lib/games/maimai/recent-details";
import { calculateDXStars, calculateNoteLosses, distributeBreaks } from "@/lib/games/maimai/score-details";

const REGULAR_NOTES = [
  ["tap", "Tap"],
  ["hold", "Hold"],
  ["slide", "Slide"],
  ["touch", "Touch"],
] as const;

export function MaimaiRecentPlayDetails({ details, play }: RecentDetailsProps<"maimai">) {
  const t = useTranslations('recentPlays');
  const { playlog, maxDxScore } = details;
  const dxStars = calculateDXStars(play.secondaryScore, maxDxScore);
  const notes = playlogNoteCounts(playlog.notes);
  const breakDist = distributeBreaks(notes, play.scoreValue / 10000, notes.break.perfect, notes.break.great);
  const losses = calculateNoteLosses(notes, breakDist);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {/* DX Score */}
        <Badge variant="outline" className="flex items-center gap-1 font-medium text-foreground">
          <Sparkle className="h-3 w-3" />
          <span>{t('labels.dx')}</span>
          <span>{play.secondaryScore}</span>
          <Slash className="h-3 w-3 text-border" />
          <span>{maxDxScore}</span>
          <div className="h-3 w-px bg-border mx-1" />
          <span>{dxStars}</span>
          <Star className="h-3 w-3" fill={dxStars > 0 ? "currentColor" : "none"} />
          <div className="h-3 w-px bg-border mx-1" />
          <span>{(play.secondaryScore / maxDxScore * 100).toFixed(2)}%</span>
        </Badge>

        {/* Rating */}
        <Badge variant="outline" className="flex items-center gap-1 font-medium text-foreground">
          <Trophy className="h-3 w-3" />
          {playlog.rating}
          {playlog.ratingChange !== 0 && (
            <span className="ml-1">
              {playlog.ratingChange > 0 ? (
                <TrendingUp className="h-3 w-3 inline mr-1" />
              ) : (
                <TrendingDown className="h-3 w-3 inline mr-1" />
              )}
              {Math.abs(playlog.ratingChange)}
            </span>
          )}
        </Badge>

        {/* Combo */}
        <Badge variant="outline" className="flex items-center gap-1 font-medium text-foreground">
          <Grip className="h-3 w-3" />
          <span>{t('labels.combo')}</span>
          <span>{playlog.combo}</span>
          <Slash className="h-3 w-3 text-border" />
          <span>{playlog.maxCombo}</span>
        </Badge>

        {/* Fast/Late */}
        <Badge variant="outline" className="flex items-center gap-1 font-medium text-foreground">
          <ArrowBigUpDash className="h-3.5 w-3.5" />
          <span>{t('labels.fast')}</span>
          <span>{playlog.fast}</span>
          <div className="h-3 w-px bg-border mx-1" />
          <ArrowBigDownDash className="h-3.5 w-3.5" />
          <span>{t('labels.late')}</span>
          <span>{playlog.late}</span>
        </Badge>

        {/* Venue (JP only) */}
        {playlog.venue && (
          <Badge variant="outline" className="flex items-center gap-1 font-medium text-foreground">
            <MapPin className="h-3 w-3" />
            <span>{playlog.venue}</span>
          </Badge>
        )}
      </div>

      {/* Notes breakdown grid */}
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

          {REGULAR_NOTES.map(([kind, label]) => {
            const counts = notes[kind];
            const loss = losses[kind];
            return (
              <Fragment key={kind}>
                <div className="text-right py-1 pl-4 pr-2 font-medium border-b border-r">{label}</div>
                <div className="text-center py-1 px-2 border-b border-r max-sm:hidden">
                  {counts.criticalPerfect + counts.perfect + counts.great + counts.good + counts.miss}
                </div>
                <div className="text-center bg-yellow-50 dark:bg-yellow-600/30 text-yellow-600 dark:text-yellow-400 py-1 px-2 border-b border-r">
                  {counts.criticalPerfect}
                </div>
                <div className="text-center bg-orange-50 dark:bg-orange-600/30 text-orange-600 dark:text-orange-400 py-1 px-2 border-b border-r">
                  {counts.perfect}
                </div>
                <div className="text-center bg-pink-50 dark:bg-pink-600/30 text-pink-600 dark:text-pink-400 py-1 px-2 border-b border-r flex flex-col items-center">
                  <div>{counts.great}</div>
                  <div className="text-xs max-sm:text-[8px] text-pink-500 dark:text-pink-400">(-{loss.great.toFixed(4)}%)</div>
                </div>
                <div className="text-center bg-green-50 dark:bg-green-600/30 text-green-600 dark:text-green-400 py-1 px-2 border-b border-r flex flex-col items-center">
                  <div>{counts.good}</div>
                  <div className="text-xs max-sm:text-[8px] text-green-500 dark:text-green-400">(-{loss.good.toFixed(4)}%)</div>
                </div>
                <div className="text-center bg-neutral-50 dark:bg-neutral-600/30 text-neutral-600 dark:text-neutral-400 py-1 px-2 border-b border-r flex flex-col items-center">
                  <div>{counts.miss}</div>
                  <div className="text-xs max-sm:text-[8px] text-neutral-500 dark:text-neutral-400">(-{loss.miss.toFixed(4)}%)</div>
                </div>
                <div className="text-center py-1 px-2 border-b font-medium text-muted-foreground flex items-center justify-center max-sm:text-2xs">
                  -{(loss.great + loss.good + loss.miss).toFixed(4)}%
                </div>
              </Fragment>
            );
          })}

          {/* Break Row */}
          <div className="text-right py-1 pl-4 pr-2 font-medium border-r">Break</div>
          <div className="text-center py-1 px-2 border-r max-sm:hidden">
            {notes.break.criticalPerfect + notes.break.perfect + notes.break.great + notes.break.good + notes.break.miss}
          </div>
          <div className="text-center bg-yellow-50 dark:bg-yellow-600/30 text-yellow-600 dark:text-yellow-400 py-1 px-2 border-r">
            {notes.break.criticalPerfect}
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
            <div>{notes.break.good}</div>
            <div className="text-xs max-sm:text-[8px] text-green-500 dark:text-green-400">(-{losses.break.good.toFixed(4)}%)</div>
          </div>
          <div className="text-center bg-neutral-50 dark:bg-neutral-600/30 text-neutral-600 dark:text-neutral-400 py-1 px-2 border-r flex flex-col items-center">
            <div>{notes.break.miss}</div>
            <div className="text-xs max-sm:text-[8px] text-neutral-500 dark:text-neutral-400">(-{losses.break.miss.toFixed(4)}%)</div>
          </div>
          <div className="text-center py-1 px-2 font-medium text-muted-foreground flex items-center justify-center max-sm:text-2xs">
            -{(losses.break.perfect + losses.break.great + losses.break.good + losses.break.miss).toFixed(4)}%
          </div>
        </div>
      </div>
    </>
  );
}
