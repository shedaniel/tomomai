"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc-client";
import { Region } from "@/lib/types";
import { cn, createSafeMaimaiImageUrl } from "@/lib/utils";
import { Clock, Loader2, AlertCircle, TrendingUp, TrendingDown, Trophy, FastForward, Rewind, ArrowBigUpDash, ArrowBigDownDash, Grip, Sparkle, MapPin, SeparatorVertical, Slash } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useCallback, useState, useEffect } from "react";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { Badge } from "./ui/badge";
import { AutoHeight } from "@/components/animate-ui/primitives/effects/auto-height";
import { logger } from "@/lib/logger";

// Constants for achievement calculation
const BASE_SCORE_PER_TYPE = {
  tap: 500,
  hold: 1000,
  slide: 1500,
  touch: 500,
  break: 2500,
} as const;

const JUDGMENT_MULTIPLIERS = {
  perfect: 1.0,
  great: 0.8,
  good: 0.5,
  miss: 0.0,
} as const;

const BREAK_JUDGMENT_MULTIPLIERS = {
  criticalPerfect: 1.0,
  perfect: 1.0,
  great2000: 0.8,
  great1500: 0.6,
  great1250: 0.5,
  good: 0.4,
  miss: 0.0,
} as const;

const BREAK_BONUS_POINTS = 100;
const MAX_BREAK_POINTS = 2600;

const BREAK_BONUS_MULTIPLIER: Record<string, number> = {
  criticalPerfect: 1.0,
  perfect2550: 0.75,
  perfect2500: 0.5,
  great2000: 0.4,
  great1500: 0.4,
  great1250: 0.4,
  good: 0.3,
  miss: 0.0,
};

const BREAK_SCORES = {
  cp: 2600,
  perfect2550: 2550,
  perfect2500: 2500,
  great2000: 2000,
  great1500: 1500,
  great1250: 1250,
  good: 1000,
  miss: 0,
} as const;

interface NoteCount {
  criticalPerfect: number;
  perfect: number;
  great: number;
  good: number;
  miss: number;
}

interface CalculateAchievementParams {
  tap: NoteCount;
  hold: NoteCount;
  slide: NoteCount;
  touch: NoteCount;
  break: NoteCount;
}

interface BreakDistribution {
  perfect2550: number;
  perfect2500: number;
  great2000: number;
  great1500: number;
  great1250: number;
}

/**
 * Calculate achievement percentage for a given note distribution
 */
function calculateAchievement(notes: CalculateAchievementParams, breakDist: BreakDistribution): number {
  // Calculate total base score
  const totalTap = notes.tap.criticalPerfect + notes.tap.perfect + notes.tap.great + notes.tap.good + notes.tap.miss;
  const totalHold = notes.hold.criticalPerfect + notes.hold.perfect + notes.hold.great + notes.hold.good + notes.hold.miss;
  const totalSlide = notes.slide.criticalPerfect + notes.slide.perfect + notes.slide.great + notes.slide.good + notes.slide.miss;
  const totalTouch = notes.touch.criticalPerfect + notes.touch.perfect + notes.touch.great + notes.touch.good + notes.touch.miss;
  const totalBreak = notes.break.criticalPerfect + notes.break.perfect + notes.break.great + notes.break.good + notes.break.miss;

  const totalBaseScore =
    totalTap * BASE_SCORE_PER_TYPE.tap +
    totalHold * BASE_SCORE_PER_TYPE.hold +
    totalSlide * BASE_SCORE_PER_TYPE.slide +
    totalTouch * BASE_SCORE_PER_TYPE.touch +
    totalBreak * BASE_SCORE_PER_TYPE.break;

  if (totalBaseScore === 0) return 0;

  // Check break distribution validity
  if (breakDist.perfect2550 + breakDist.perfect2500 !== notes.break.perfect) {
    logger.error(`Break distribution invalid: perfect2550 + perfect2500 !== perfect: ${breakDist.perfect2550} + ${breakDist.perfect2500} !== ${notes.break.perfect}`);
    return 0;
  }
  if (breakDist.great2000 + breakDist.great1500 + breakDist.great1250 !== notes.break.great) {
    logger.error(`Break distribution invalid: great2000 + great1500 + great1250 !== great: ${breakDist.great2000} + ${breakDist.great1500} + ${breakDist.great1250} !== ${notes.break.great}`);
    return 0;
  }

  // Calculate actual score for regular notes
  let actualScore = 0;

  // Tap
  actualScore += notes.tap.criticalPerfect * BASE_SCORE_PER_TYPE.tap * JUDGMENT_MULTIPLIERS.perfect;
  actualScore += notes.tap.perfect * BASE_SCORE_PER_TYPE.tap * JUDGMENT_MULTIPLIERS.perfect;
  actualScore += notes.tap.great * BASE_SCORE_PER_TYPE.tap * JUDGMENT_MULTIPLIERS.great;
  actualScore += notes.tap.good * BASE_SCORE_PER_TYPE.tap * JUDGMENT_MULTIPLIERS.good;

  // Hold
  actualScore += notes.hold.criticalPerfect * BASE_SCORE_PER_TYPE.hold * JUDGMENT_MULTIPLIERS.perfect;
  actualScore += notes.hold.perfect * BASE_SCORE_PER_TYPE.hold * JUDGMENT_MULTIPLIERS.perfect;
  actualScore += notes.hold.great * BASE_SCORE_PER_TYPE.hold * JUDGMENT_MULTIPLIERS.great;
  actualScore += notes.hold.good * BASE_SCORE_PER_TYPE.hold * JUDGMENT_MULTIPLIERS.good;

  // Slide
  actualScore += notes.slide.criticalPerfect * BASE_SCORE_PER_TYPE.slide * JUDGMENT_MULTIPLIERS.perfect;
  actualScore += notes.slide.perfect * BASE_SCORE_PER_TYPE.slide * JUDGMENT_MULTIPLIERS.perfect;
  actualScore += notes.slide.great * BASE_SCORE_PER_TYPE.slide * JUDGMENT_MULTIPLIERS.great;
  actualScore += notes.slide.good * BASE_SCORE_PER_TYPE.slide * JUDGMENT_MULTIPLIERS.good;

  // Touch
  actualScore += notes.touch.criticalPerfect * BASE_SCORE_PER_TYPE.touch * JUDGMENT_MULTIPLIERS.perfect;
  actualScore += notes.touch.perfect * BASE_SCORE_PER_TYPE.touch * JUDGMENT_MULTIPLIERS.perfect;
  actualScore += notes.touch.great * BASE_SCORE_PER_TYPE.touch * JUDGMENT_MULTIPLIERS.great;
  actualScore += notes.touch.good * BASE_SCORE_PER_TYPE.touch * JUDGMENT_MULTIPLIERS.good;

  // Break
  actualScore += notes.break.criticalPerfect * BASE_SCORE_PER_TYPE.break * BREAK_JUDGMENT_MULTIPLIERS.criticalPerfect;
  actualScore += notes.break.perfect * BASE_SCORE_PER_TYPE.break * BREAK_JUDGMENT_MULTIPLIERS.perfect;
  actualScore += breakDist.great2000 * BASE_SCORE_PER_TYPE.break * BREAK_JUDGMENT_MULTIPLIERS.great2000;
  actualScore += breakDist.great1500 * BASE_SCORE_PER_TYPE.break * BREAK_JUDGMENT_MULTIPLIERS.great1500;
  actualScore += breakDist.great1250 * BASE_SCORE_PER_TYPE.break * BREAK_JUDGMENT_MULTIPLIERS.great1250;
  actualScore += notes.break.good * BASE_SCORE_PER_TYPE.break * BREAK_JUDGMENT_MULTIPLIERS.good;
  actualScore += notes.break.miss * BASE_SCORE_PER_TYPE.break * BREAK_JUDGMENT_MULTIPLIERS.miss;

  // Break - additional bonus points
  let bonusPoints = 0, totalBonusPoints = 0;
  bonusPoints += notes.break.criticalPerfect * BREAK_BONUS_MULTIPLIER.criticalPerfect;
  bonusPoints += breakDist.perfect2550 * BREAK_BONUS_MULTIPLIER.perfect2550;
  bonusPoints += breakDist.perfect2500 * BREAK_BONUS_MULTIPLIER.perfect2500;
  bonusPoints += breakDist.great2000 * BREAK_BONUS_MULTIPLIER.great2000;
  bonusPoints += breakDist.great1500 * BREAK_BONUS_MULTIPLIER.great1500;
  bonusPoints += breakDist.great1250 * BREAK_BONUS_MULTIPLIER.great1250;
  bonusPoints += notes.break.good * BREAK_BONUS_MULTIPLIER.good;
  bonusPoints += notes.break.miss * BREAK_BONUS_MULTIPLIER.miss;

  totalBonusPoints += notes.break.criticalPerfect;
  totalBonusPoints += notes.break.perfect;
  totalBonusPoints += notes.break.great;
  totalBonusPoints += notes.break.good;
  totalBonusPoints += notes.break.miss;

  const scorePerPercentage = totalBaseScore / 100;
  const bonusPointsPercentage = bonusPoints / totalBonusPoints;
  return actualScore / scorePerPercentage + bonusPointsPercentage;
}

/**
 * Find the break distribution that best matches the actual achievement
 * Uses a "walk" algorithm to try different distributions
 */
function distributeBreaks(
  notes: CalculateAchievementParams,
  actualAchievement: number,
  perfectCount: number,
  greatCount: number
): BreakDistribution {
  let bestDist: BreakDistribution = {
    perfect2550: perfectCount,
    perfect2500: 0,
    great2000: greatCount,
    great1500: 0,
    great1250: 0,
  };
  let bestDiff = Infinity;

  // Try all possible distributions of perfects (2550 vs 2500)
  for (let p2550 = 0; p2550 <= perfectCount; p2550++) {
    const p2500 = perfectCount - p2550;

    // Try all possible distributions of greats (2000, 1500, 1250)
    for (let g2000 = 0; g2000 <= greatCount; g2000++) {
      for (let g1500 = 0; g1500 <= greatCount - g2000; g1500++) {
        const g1250 = greatCount - g2000 - g1500;

        const dist: BreakDistribution = {
          perfect2550: p2550,
          perfect2500: p2500,
          great2000: g2000,
          great1500: g1500,
          great1250: g1250,
        };

        const calculatedAchievement = calculateAchievement(notes, dist);
        const diff = Math.abs(calculatedAchievement - actualAchievement);

        if (diff < bestDiff) {
          bestDiff = diff;
          bestDist = dist;
        }

        logger.debug(`Trying distribution ${p2550}-${p2500} ${g2000}-${g1500}-${g1250}, diff: ${diff}, calculatedAchievement: ${calculatedAchievement}, actualAchievement: ${actualAchievement}`);

        // Early exit if we found an exact match
        if (diff < 0.00001) {
          return bestDist;
        }
      }
    }
  }

  return bestDist;
}

/**
 * Calculate percentage LOSS for each note judgment cell compared to Critical Perfect
 */
function calculateNoteLosses(notes: CalculateAchievementParams, breakDist: BreakDistribution) {
  // Calculate total base score (denominator) - similar to reference's totalBaseScore
  const totalTap = notes.tap.criticalPerfect + notes.tap.perfect + notes.tap.great + notes.tap.good + notes.tap.miss;
  const totalHold = notes.hold.criticalPerfect + notes.hold.perfect + notes.hold.great + notes.hold.good + notes.hold.miss;
  const totalSlide = notes.slide.criticalPerfect + notes.slide.perfect + notes.slide.great + notes.slide.good + notes.slide.miss;
  const totalTouch = notes.touch.criticalPerfect + notes.touch.perfect + notes.touch.great + notes.touch.good + notes.touch.miss;
  const totalBreak = notes.break.criticalPerfect + notes.break.perfect + notes.break.great + notes.break.good + notes.break.miss;

  const totalBaseScore =
    totalTap * BASE_SCORE_PER_TYPE.tap +
    totalHold * BASE_SCORE_PER_TYPE.hold +
    totalSlide * BASE_SCORE_PER_TYPE.slide +
    totalTouch * BASE_SCORE_PER_TYPE.touch +
    totalBreak * BASE_SCORE_PER_TYPE.break;

  const scorePerPercentage = totalBaseScore / 100;

  // Helper to calculate loss percentage for regular notes
  // Loss = what we would have gotten if CP - what we actually got
  const calcRegularLoss = (count: number, baseScore: number, multiplier: number) => {
    if (scorePerPercentage === 0 || count === 0) return 0;
    const cpScore = count * baseScore * JUDGMENT_MULTIPLIERS.perfect;
    const actualScore = count * baseScore * multiplier;
    const lossScore = cpScore - actualScore;
    return (lossScore / scorePerPercentage);
  };

  // Calculate break perfect loss using actual distribution
  // Following the same logic as calculateAchievement: base score + bonus
  const calcBreakPerfectLoss = () => {
    if (scorePerPercentage === 0 || totalBreak === 0) return 0;

    const perfectCount = notes.break.perfect;
    if (perfectCount === 0) return 0;

    // What we would get if all perfects were CP
    const cpBaseScore = perfectCount * BASE_SCORE_PER_TYPE.break * BREAK_JUDGMENT_MULTIPLIERS.criticalPerfect;
    const cpBonusPoints = perfectCount * BREAK_BONUS_MULTIPLIER.criticalPerfect;

    // What we actually get with the distribution (base score)
    const actualBaseScore = perfectCount * BASE_SCORE_PER_TYPE.break * BREAK_JUDGMENT_MULTIPLIERS.perfect;

    // What we actually get with the distribution (bonus points)
    const actualBonusPoints =
      breakDist.perfect2550 * BREAK_BONUS_MULTIPLIER.perfect2550 +
      breakDist.perfect2500 * BREAK_BONUS_MULTIPLIER.perfect2500;

    // Loss from base score
    const baseScoreLoss = (cpBaseScore - actualBaseScore) / scorePerPercentage;

    // Loss from bonus (as percentage, same as in calculateAchievement)
    const bonusLoss = (cpBonusPoints - actualBonusPoints) / totalBreak;

    return baseScoreLoss + bonusLoss;
  };

  // Calculate break great loss using actual distribution
  const calcBreakGreatLoss = () => {
    if (scorePerPercentage === 0 || totalBreak === 0) return 0;

    const greatCount = notes.break.great;
    if (greatCount === 0) return 0;

    // What we would get if all greats were CP
    const cpBaseScore = greatCount * BASE_SCORE_PER_TYPE.break * BREAK_JUDGMENT_MULTIPLIERS.criticalPerfect;
    const cpBonusPoints = greatCount * BREAK_BONUS_MULTIPLIER.criticalPerfect;

    // What we actually get with the distribution (base score)
    const actualBaseScore =
      breakDist.great2000 * BASE_SCORE_PER_TYPE.break * BREAK_JUDGMENT_MULTIPLIERS.great2000 +
      breakDist.great1500 * BASE_SCORE_PER_TYPE.break * BREAK_JUDGMENT_MULTIPLIERS.great1500 +
      breakDist.great1250 * BASE_SCORE_PER_TYPE.break * BREAK_JUDGMENT_MULTIPLIERS.great1250;

    // What we actually get with the distribution (bonus points)
    const actualBonusPoints =
      breakDist.great2000 * BREAK_BONUS_MULTIPLIER.great2000 +
      breakDist.great1500 * BREAK_BONUS_MULTIPLIER.great1500 +
      breakDist.great1250 * BREAK_BONUS_MULTIPLIER.great1250;

    // Loss from base score
    const baseScoreLoss = (cpBaseScore - actualBaseScore) / scorePerPercentage;

    // Loss from bonus (as percentage, same as in calculateAchievement)
    const bonusLoss = (cpBonusPoints - actualBonusPoints) / totalBreak;

    return baseScoreLoss + bonusLoss;
  };

  // Helper to calculate loss percentage for break good/miss
  const calcBreakLoss = (count: number, judgmentMultiplier: number, bonusMultiplier: number) => {
    if (scorePerPercentage === 0 || totalBreak === 0 || count === 0) return 0;

    // What we would get if CP
    const cpBaseScore = count * BASE_SCORE_PER_TYPE.break * BREAK_JUDGMENT_MULTIPLIERS.criticalPerfect;
    const cpBonusPoints = count * BREAK_BONUS_MULTIPLIER.criticalPerfect;

    // What we actually get
    const actualBaseScore = count * BASE_SCORE_PER_TYPE.break * judgmentMultiplier;
    const actualBonusPoints = count * bonusMultiplier;

    // Loss from base score
    const baseScoreLoss = (cpBaseScore - actualBaseScore) / scorePerPercentage;

    // Loss from bonus (as percentage, same as in calculateAchievement)
    const bonusLoss = (cpBonusPoints - actualBonusPoints) / totalBreak;

    return baseScoreLoss + bonusLoss;
  };

  return {
    tap: {
      great: calcRegularLoss(notes.tap.great, BASE_SCORE_PER_TYPE.tap, JUDGMENT_MULTIPLIERS.great),
      good: calcRegularLoss(notes.tap.good, BASE_SCORE_PER_TYPE.tap, JUDGMENT_MULTIPLIERS.good),
      miss: calcRegularLoss(notes.tap.miss, BASE_SCORE_PER_TYPE.tap, JUDGMENT_MULTIPLIERS.miss),
    },
    hold: {
      great: calcRegularLoss(notes.hold.great, BASE_SCORE_PER_TYPE.hold, JUDGMENT_MULTIPLIERS.great),
      good: calcRegularLoss(notes.hold.good, BASE_SCORE_PER_TYPE.hold, JUDGMENT_MULTIPLIERS.good),
      miss: calcRegularLoss(notes.hold.miss, BASE_SCORE_PER_TYPE.hold, JUDGMENT_MULTIPLIERS.miss),
    },
    slide: {
      great: calcRegularLoss(notes.slide.great, BASE_SCORE_PER_TYPE.slide, JUDGMENT_MULTIPLIERS.great),
      good: calcRegularLoss(notes.slide.good, BASE_SCORE_PER_TYPE.slide, JUDGMENT_MULTIPLIERS.good),
      miss: calcRegularLoss(notes.slide.miss, BASE_SCORE_PER_TYPE.slide, JUDGMENT_MULTIPLIERS.miss),
    },
    touch: {
      great: calcRegularLoss(notes.touch.great, BASE_SCORE_PER_TYPE.touch, JUDGMENT_MULTIPLIERS.great),
      good: calcRegularLoss(notes.touch.good, BASE_SCORE_PER_TYPE.touch, JUDGMENT_MULTIPLIERS.good),
      miss: calcRegularLoss(notes.touch.miss, BASE_SCORE_PER_TYPE.touch, JUDGMENT_MULTIPLIERS.miss),
    },
    break: {
      perfect: calcBreakPerfectLoss(),
      great: calcBreakGreatLoss(),
      good: calcBreakLoss(notes.break.good, BREAK_JUDGMENT_MULTIPLIERS.good, BREAK_BONUS_MULTIPLIER.good),
      miss: calcBreakLoss(notes.break.miss, BREAK_JUDGMENT_MULTIPLIERS.miss, BREAK_BONUS_MULTIPLIER.miss),
    },
  };
}

interface RecentSongsCardProps {
  region: Region;
  beforeDate?: Date;
}

export function RecentSongsCard({ region, beforeDate }: RecentSongsCardProps) {
  const t = useTranslations('recentPlays');
  const [allPlays, setAllPlays] = useState<any[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const limit = 20;

  const { data, isLoading, error } = trpc.user.getRecentSongs.useQuery({
    region,
    limit,
    offset,
    beforeDate,
  });

  // Reset pagination state when region or beforeDate changes
  useEffect(() => {
    setOffset(0);
    setAllPlays([]);
    setHasMore(true);
  }, [region, beforeDate]);

  // Update allPlays when new data arrives
  useEffect(() => {
    if (data) {
      if (offset === 0) {
        setAllPlays(data.recentPlays);
      } else {
        setAllPlays(prev => [...prev, ...data.recentPlays]);
      }
      setHasMore(data.hasMore);
    }
  }, [data, offset]);

  const loadMore = useCallback(() => {
    if (hasMore && !isLoading) {
      setOffset(prev => prev + limit);
    }
  }, [hasMore, isLoading]);

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

  const sentinelRef = useInfiniteScroll(loadMore, hasMore && !isLoading);

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

  const totalCount = data?.totalCount ?? 0;

  if (allPlays.length === 0 && !isLoading) {
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
          {allPlays.map((play, i) => {
            const isDetailed = play.rating !== null;
            const isExpanded = expandedIds.has(play.recentSongId.toString());
            const playDate = new Date(play.playedAt);

            return (
              <div
                key={play.recentSongId}
                onClick={() => toggleExpand(play.recentSongId.toString())}
                className={cn("flex flex-col transition-colors cursor-pointer",
                  i === 0 ? "pb-4" : "py-4",
                )}
              >
                <div className="flex gap-4">
                  {/* Song Cover */}
                  <div className="relative flex-shrink-0">
                    <Image
                      src={createSafeMaimaiImageUrl(play.cover)}
                      alt={play.songName}
                      className={cn(
                        "w-14 h-14 rounded ring-2 ring-offset-2 ring-offset-card object-cover",
                        play.difficulty === "basic" && "ring-green-400",
                        play.difficulty === "advanced" && "ring-yellow-400",
                        play.difficulty === "expert" && "ring-red-400",
                        play.difficulty === "master" && "ring-purple-500",
                        play.difficulty === "remaster" && "ring-purple-200",
                      )}
                      width={56}
                      height={56}
                      loading="lazy"
                    />
                    {/* Difficulty Badge */}
                    <div
                      className={cn(
                        "absolute top-12 -right-1 px-1.5 py-0.5 rounded text-xs font-semibold text-white",
                        play.difficulty === "basic" && "bg-green-500",
                        play.difficulty === "advanced" && "bg-yellow-500",
                        play.difficulty === "expert" && "bg-red-500",
                        play.difficulty === "master" && "bg-purple-500",
                        play.difficulty === "remaster" && "bg-purple-200 text-purple-900",
                      )}
                    >
                      {(play.levelPrecise / 10).toFixed(1)}
                    </div>
                  </div>

                  {/* Song Info */}
                  <div className="flex-1 min-w-0 self-center">
                    <h4 className="font-semibold truncate">{play.songName}</h4>
                    <p className="text-xs text-muted-foreground truncate">
                      {play.artist}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0 space-y-0.5 flex flex-col items-end justify-between">
                    {/* Track and Date at the very top */}
                    <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
                      <span>{playDate.toLocaleDateString()} {playDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      <Badge variant="secondary" className="text-xs">
                        Track {play.track}
                      </Badge>
                    </div>
                    {/* FC/FS badges */}
                    {play.fc !== 'none' || play.fs !== 'none' ? (
                      <div className="text-xs text-muted-foreground">
                        {play.fc !== 'none' ? play.fc.toUpperCase() : ''}{' '}
                        {play.fs !== 'none' ? play.fs.toUpperCase() : ''}
                      </div>
                    ) : null}
                    {/* Achievement */}
                    <div className="font-mono text-sm font-semibold">
                      {(play.achievement / 10000).toFixed(4)}%
                    </div>
                    {/* Loading indicator */}
                    {!isDetailed && (
                      <Badge variant="outline" className="text-muted-foreground text-xs">
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        Loading...
                      </Badge>
                    )}
                  </div>
                </div>


                {/* Animated expandable content */}
                <AutoHeight deps={[isExpanded, isDetailed]}>
                  {isExpanded && isDetailed && (
                    <>
                      {/* Take up space */}
                      <div className="h-6" />

                      {/* Detailed Info */}
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        {/* DX Score */}
                        <Badge variant="outline" className="flex items-center gap-1 font-medium text-primary/80">
                          <Sparkle className="h-3 w-3" />
                          <span>{t('labels.dx')}</span>
                          <span>{play.dxScore}</span>
                          <Slash className="h-3 w-3 text-border" />
                          <span>{play.maxDxScore}</span>
                        </Badge>

                        {/* Rating */}
                        {play.rating !== null && (
                          <Badge variant="outline" className="flex items-center gap-1 font-medium text-primary/80">
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
                          <Badge variant="outline" className="flex items-center gap-1 font-medium text-primary/80">
                            <Grip className="h-3 w-3" />
                            <span>{t('labels.combo')}</span>
                            <span>{play.combo}</span>
                            <Slash className="h-3 w-3 text-border" />
                            <span>{play.maxCombo}</span>
                          </Badge>
                        )}

                        {/* Fast/Late */}
                        {(play.fastCount !== null || play.lateCount !== null) && (<>
                          <Badge variant="outline" className="flex items-center gap-1 font-medium text-primary/80">
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
                          <Badge variant="outline" className="flex items-center gap-1 font-medium text-primary/80">
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
                            <div className="grid grid-cols-[auto_1fr_1fr_1fr_1fr_1fr_1fr_1fr] text-sm min-w-fit border rounded-md">
                              {/* Header Row */}
                              <div className="text-center py-1 pl-4 pr-2 font-medium text-muted-foreground bg-accent/50 border-b border-r flex items-center justify-end">{t('notesBreakdown.type')}</div>
                              <div className="text-center py-1 px-2 font-medium text-muted-foreground bg-accent/50 border-b border-r flex items-center justify-center">{t('notesBreakdown.total')}</div>
                              <div className="text-center py-1 px-2 font-medium text-muted-foreground bg-accent/50 border-b border-r flex items-center justify-center gap-1">
                                Critical Perfect
                                <div className="w-3.5 h-3.5 bg-amber-500 rounded-full shrink-0" />
                              </div>
                              <div className="text-center py-1 px-2 font-medium text-muted-foreground bg-accent/50 border-b border-r flex items-center justify-center gap-1">
                                Perfect
                                <div className="w-3.5 h-3.5 bg-amber-400 rounded-full shrink-0" />
                              </div>
                              <div className="text-center py-1 px-2 font-medium text-muted-foreground bg-accent/50 border-b border-r flex items-center justify-center gap-1">
                                Great
                                <div className="w-3.5 h-3.5 bg-pink-400 rounded-full shrink-0" />
                              </div>
                              <div className="text-center py-1 px-2 font-medium text-muted-foreground bg-accent/50 border-b border-r flex items-center justify-center gap-1">
                                Good
                                <div className="w-3.5 h-3.5 bg-green-500 rounded-full shrink-0" />
                              </div>
                              <div className="text-center py-1 px-2 font-medium text-muted-foreground bg-accent/50 border-b border-r flex items-center justify-center gap-1">
                                Miss
                                <div className="w-3.5 h-3.5 bg-neutral-500 rounded-full shrink-0" />
                              </div>
                              <div className="text-center py-1 px-2 font-medium text-muted-foreground bg-accent/50 border-b flex items-center justify-center">
                                {t('notesBreakdown.totalLoss')}
                              </div>

                              {/* Tap Row */}
                              <div className="text-right py-1 pl-4 pr-2 font-medium border-b border-r">Tap</div>
                              <div className="text-center py-1 px-2 border-b border-r">
                                {(play.tapCPerfect ?? 0) + (play.tapPerfect ?? 0) + (play.tapGreat ?? 0) + (play.tapGood ?? 0) + (play.tapMiss ?? 0)}
                              </div>
                              <div className="text-center py-1 px-2 border-b border-r">
                                {play.tapCPerfect ?? 0}
                              </div>
                              <div className="text-center py-1 px-2 border-b border-r">
                                {play.tapPerfect ?? 0}
                              </div>
                              <div className="text-center py-1 px-2 border-b border-r flex flex-col items-center">
                                <div>{play.tapGreat ?? 0}</div>
                                <div className="text-xs text-muted-foreground">(-{losses.tap.great.toFixed(4)}%)</div>
                              </div>
                              <div className="text-center py-1 px-2 border-b border-r flex flex-col items-center">
                                <div>{play.tapGood ?? 0}</div>
                                <div className="text-xs text-muted-foreground">(-{losses.tap.good.toFixed(4)}%)</div>
                              </div>
                              <div className="text-center py-1 px-2 border-b border-r flex flex-col items-center">
                                <div>{play.tapMiss ?? 0}</div>
                                <div className="text-xs text-muted-foreground">(-{losses.tap.miss.toFixed(4)}%)</div>
                              </div>
                              <div className="text-center py-1 px-2 border-b font-medium text-muted-foreground flex items-center justify-center">
                                -{(losses.tap.great + losses.tap.good + losses.tap.miss).toFixed(4)}%
                              </div>

                              {/* Hold Row */}
                              <div className="text-right py-1 pl-4 pr-2 font-medium border-b border-r">Hold</div>
                              <div className="text-center py-1 px-2 border-b border-r">
                                {(play.holdCPerfect ?? 0) + (play.holdPerfect ?? 0) + (play.holdGreat ?? 0) + (play.holdGood ?? 0) + (play.holdMiss ?? 0)}
                              </div>
                              <div className="text-center py-1 px-2 border-b border-r">
                                {play.holdCPerfect ?? 0}
                              </div>
                              <div className="text-center py-1 px-2 border-b border-r">
                                {play.holdPerfect ?? 0}
                              </div>
                              <div className="text-center py-1 px-2 border-b border-r flex flex-col items-center">
                                <div>{play.holdGreat ?? 0}</div>
                                <div className="text-xs text-muted-foreground">(-{losses.hold.great.toFixed(4)}%)</div>
                              </div>
                              <div className="text-center py-1 px-2 border-b border-r flex flex-col items-center">
                                <div>{play.holdGood ?? 0}</div>
                                <div className="text-xs text-muted-foreground">(-{losses.hold.good.toFixed(4)}%)</div>
                              </div>
                              <div className="text-center py-1 px-2 border-b border-r flex flex-col items-center">
                                <div>{play.holdMiss ?? 0}</div>
                                <div className="text-xs text-muted-foreground">(-{losses.hold.miss.toFixed(4)}%)</div>
                              </div>
                              <div className="text-center py-1 px-2 border-b font-medium text-muted-foreground flex items-center justify-center">
                                -{(losses.hold.great + losses.hold.good + losses.hold.miss).toFixed(4)}%
                              </div>

                              {/* Slide Row */}
                              <div className="text-right py-1 pl-4 pr-2 font-medium border-b border-r">Slide</div>
                              <div className="text-center py-1 px-2 border-b border-r">
                                {(play.slideCPerfect ?? 0) + (play.slidePerfect ?? 0) + (play.slideGreat ?? 0) + (play.slideGood ?? 0) + (play.slideMiss ?? 0)}
                              </div>
                              <div className="text-center py-1 px-2 border-b border-r">
                                {play.slideCPerfect ?? 0}
                              </div>
                              <div className="text-center py-1 px-2 border-b border-r">
                                {play.slidePerfect ?? 0}
                              </div>
                              <div className="text-center py-1 px-2 border-b border-r flex flex-col items-center">
                                <div>{play.slideGreat ?? 0}</div>
                                <div className="text-xs text-muted-foreground">(-{losses.slide.great.toFixed(4)}%)</div>
                              </div>
                              <div className="text-center py-1 px-2 border-b border-r flex flex-col items-center">
                                <div>{play.slideGood ?? 0}</div>
                                <div className="text-xs text-muted-foreground">(-{losses.slide.good.toFixed(4)}%)</div>
                              </div>
                              <div className="text-center py-1 px-2 border-b border-r flex flex-col items-center">
                                <div>{play.slideMiss ?? 0}</div>
                                <div className="text-xs text-muted-foreground">(-{losses.slide.miss.toFixed(4)}%)</div>
                              </div>
                              <div className="text-center py-1 px-2 border-b font-medium text-muted-foreground flex items-center justify-center">
                                -{(losses.slide.great + losses.slide.good + losses.slide.miss).toFixed(4)}%
                              </div>

                              {/* Touch Row */}
                              <div className="text-right py-1 pl-4 pr-2 font-medium border-b border-r">Touch</div>
                              <div className="text-center py-1 px-2 border-b border-r">
                                {(play.touchCPerfect ?? 0) + (play.touchPerfect ?? 0) + (play.touchGreat ?? 0) + (play.touchGood ?? 0) + (play.touchMiss ?? 0)}
                              </div>
                              <div className="text-center py-1 px-2 border-b border-r">
                                {play.touchCPerfect ?? 0}
                              </div>
                              <div className="text-center py-1 px-2 border-b border-r">
                                {play.touchPerfect ?? 0}
                              </div>
                              <div className="text-center py-1 px-2 border-b border-r flex flex-col items-center">
                                <div>{play.touchGreat ?? 0}</div>
                                <div className="text-xs text-muted-foreground">(-{losses.touch.great.toFixed(4)}%)</div>
                              </div>
                              <div className="text-center py-1 px-2 border-b border-r flex flex-col items-center">
                                <div>{play.touchGood ?? 0}</div>
                                <div className="text-xs text-muted-foreground">(-{losses.touch.good.toFixed(4)}%)</div>
                              </div>
                              <div className="text-center py-1 px-2 border-b border-r flex flex-col items-center">
                                <div>{play.touchMiss ?? 0}</div>
                                <div className="text-xs text-muted-foreground">(-{losses.touch.miss.toFixed(4)}%)</div>
                              </div>
                              <div className="text-center py-1 px-2 border-b font-medium text-muted-foreground flex items-center justify-center">
                                -{(losses.touch.great + losses.touch.good + losses.touch.miss).toFixed(4)}%
                              </div>

                              {/* Break Row */}
                              <div className="text-right py-1 pl-4 pr-2 font-medium border-r">Break</div>
                              <div className="text-center py-1 px-2 border-r">
                                {(play.breakCPerfect ?? 0) + (play.breakPerfect ?? 0) + (play.breakGreat ?? 0) + (play.breakGood ?? 0) + (play.breakMiss ?? 0)}
                              </div>
                              <div className="text-center py-1 px-2 border-r">
                                {play.breakCPerfect ?? 0}
                              </div>
                              <div className="text-center py-1 px-2 border-r flex flex-col items-center">
                                <div>{breakDist.perfect2550}-{breakDist.perfect2500}</div>
                                <div className="text-xs text-muted-foreground">(-{losses.break.perfect.toFixed(4)}%)</div>
                              </div>
                              <div className="text-center py-1 px-2 border-r flex flex-col items-center">
                                <div>{breakDist.great2000}-{breakDist.great1500}-{breakDist.great1250}</div>
                                <div className="text-xs text-muted-foreground">(-{losses.break.great.toFixed(4)}%)</div>
                              </div>
                              <div className="text-center py-1 px-2 border-r flex flex-col items-center">
                                <div>{play.breakGood ?? 0}</div>
                                <div className="text-xs text-muted-foreground">(-{losses.break.good.toFixed(4)}%)</div>
                              </div>
                              <div className="text-center py-1 px-2 border-r flex flex-col items-center">
                                <div>{play.breakMiss ?? 0}</div>
                                <div className="text-xs text-muted-foreground">(-{losses.break.miss.toFixed(4)}%)</div>
                              </div>
                              <div className="text-center py-1 px-2 font-medium text-muted-foreground flex items-center justify-center">
                                -{(losses.break.perfect + losses.break.great + losses.break.good + losses.break.miss).toFixed(4)}%
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </>
                  )}
                </AutoHeight>
              </div>
            );
          })}

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

