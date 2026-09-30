"use client";

import { useGame, usePresentation } from "@/components/providers/game-provider";
import { GAME_UI } from "@/components/games/registry";
import { supportsGameFeature } from "@/lib/games/frontend";
import type { GameSnapshotData } from "@/lib/games/player-view";
import { keyOf } from "@/lib/games/codes";
import { formatGameScore, formatGameScoreDelta, formatGameRating, formatGameLevel, getGameDifficulty, getGameChartType, getGameRankingBuckets } from "@/lib/games/presentation";
import { formatRecommendationTarget, generateRecommendations, type RecommendationData } from "@/lib/games/recommendations";
import { Region } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Award, Calendar, Disc3, Filter, Hash, Heart, Layers, Target, Zap } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { CoverImage } from "@/components/cover-image";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Select, SelectContent, SelectTrigger, SelectItem, SelectValue } from "@tomomai/ui/select-friendly";
import type { Flags } from "@/lib/flags";
import { Button } from "@tomomai/ui";
import { motion, AnimatePresence } from "motion/react";
import { FilterPanel, GenericFilter, getFilterKey } from "@/components/filter-panel";
import { createRecommendationFilterCategories, createRecommendationFilterLabel, applyRecommendationFilters } from "./recommendation-filters";
import { STAGGER, getTransition } from "@/lib/animation-constants";
import { logger } from "@/lib/logger";
import { trpc } from "@/lib/trpc-client";
import { useMediaQuery } from "@/hooks/use-media-query";

function RecommendationRow({ recommendation }: { recommendation: RecommendationData }) {
  const t = useTranslations('recommendations');
  const tBucket = useTranslations('dataContent.rankingBucket');
  const format = useFormatter();
  const game = useGame().id;
  const [newBucket, oldBucket] = getGameRankingBuckets(game);
  const { song, target, targetRating, ratingGain, isInBest, category } = recommendation;
  const chartType = getGameChartType(game, song.typeCode);
  const difficulty = getGameDifficulty(game, song.difficultyCode);
  const { ScoreHover } = GAME_UI[game];
  return (
    <ScoreHover score={song}>
      <motion.div
        className="flex xs:justify-between xs:items-center text-sm min-h-16 py-2 max-xs:min-h-30 max-xs:flex-col max-xs:justify-start max-xs:gap-y-2 px-2 -mx-2 rounded-md cursor-pointer group"
      >
        <div className="flex items-center xs:flex-1 min-w-0 min-h-12 max-xs:mt-1.5">
          <CoverImage
            coverUrl={song.cover}
            alt={song.songName}
            className={cn(
              "w-8 h-8 shrink-0 ml-1 mr-3 rounded ring-2 ring-offset-2 ring-offset-background",
              difficulty.classes.ring,
            )}
            width={36}
            height={36}
            loading="lazy"
          />

          <div className="flex-1 min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 md:flex-nowrap">
              <div className="min-w-0 basis-full truncate font-medium md:basis-auto">{song.songName}</div>
              <div className={cn(
                "px-1.5 py-0.5 rounded text-xs font-medium whitespace-nowrap",
                category === "new" ? "bg-lime-100 text-lime-800 dark:bg-lime-600/30 dark:text-lime-400" : "bg-orange-100 text-orange-800 dark:bg-orange-600/30 dark:text-orange-400"
              )}>
                {t(category === 'new' ? 'newBadge' : 'oldBadge')}
              </div>
              {category === "new" && isInBest && (
                <div className="px-1.5 py-0.5 rounded text-xs font-medium whitespace-nowrap bg-green-100 text-green-800 dark:bg-green-600/30 dark:text-green-400">
                  {tBucket('short', { size: newBucket.size })}
                </div>
              )}
              {category === "old" && isInBest && (
                <div className="px-1.5 py-0.5 rounded text-xs font-medium whitespace-nowrap bg-red-100 text-red-800 dark:bg-red-600/30 dark:text-red-400">
                  {tBucket('short', { size: oldBucket.size })}
                </div>
              )}
              {recommendation.hasPotential && recommendation.peerReach != null && (
                <span className="inline-flex shrink-0 whitespace-nowrap rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary dark:bg-primary/20">
                  {t('peerAchieved', { percent: format.number(recommendation.peerReach, { style: 'percent', maximumFractionDigits: 0 }) })}
                </span>
              )}
            </div>
            <div className="text-muted-foreground text-xs truncate">
              {!chartType.implicit && `${chartType.label} • `}{difficulty.label} {formatGameLevel(game, song.levelPrecise, song.difficultyCode)} • {song.artist}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="xs:text-right xs:ml-2">
            <div className="text-xs text-muted-foreground">{t('currentToTarget')}</div>
            <div className="font-mono text-xs">
              {formatGameScore(game, song.scoreValue, { precision: "compact" })} → <span className="text-green-600 dark:text-green-400">{formatRecommendationTarget(game, target)}</span>
            </div>
            <div className="font-mono text-xs">
              {formatGameRating(game, song.rating)} → <span className="text-green-600 dark:text-green-400">{formatGameRating(game, targetRating)}</span>
            </div>
          </div>

          <div className="text-right ml-4 mr-2 space-y-0.5 w-16">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Target className="h-3 w-3 text-amber-500" />
              {target.kind === "combo" ? (
                <span className="text-orange-400 font-semibold">{target.label}</span>
              ) : (
                <span>+{formatGameScoreDelta(game, song.scoreValue, target.scoreValue)}</span>
              )}
            </div>
            <div className="text-xs flex items-center gap-1">
              <Zap className="h-3 w-3 text-green-500" />
              <span className="font-mono font-semibold">+{formatGameRating(game, ratingGain)}</span>
            </div>
          </div>
        </div>
      </motion.div>
    </ScoreHover>
  );
}

export function RecommendationCard({ selectedSnapshotData, flags, region }: { selectedSnapshotData: GameSnapshotData, flags: Flags, region: Region }) {
  const t = useTranslations();
  const frontendGame = useGame();
  const game = frontendGame.id;
  const { scoreLabel } = usePresentation();
  const bestBuckets = Object.fromEntries(getGameRankingBuckets(game).map(bucket => [bucket.key, t('dataContent.rankingBucket.short', { size: bucket.size })]));
  const isDesktop = useMediaQuery("(min-width: 768px)", { initializeWithValue: false });
  const [filterCategory, setFilterCategory] = useState<"all" | "new" | "old" | "best">("all");
  const [advancedFilters, setAdvancedFilters] = useState<GenericFilter[]>([]);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const { snapshot } = selectedSnapshotData;

  const baseRecommendations = useMemo(
    () => generateRecommendations(selectedSnapshotData),
    [selectedSnapshotData]
  );

  const potentialEnabled = !!flags.scorePercentile && supportsGameFeature(frontendGame, "percentiles");
  const potentialSongIds = useMemo(() => [...new Set(baseRecommendations.map(rec => rec.song.songId))].slice(0, 2000).sort(), [baseRecommendations]);
  const { data: potential, status: potentialStatus, fetchStatus: potentialFetchStatus, error: potentialError } = trpc.maimai.getRecommendationPeers.useQuery(
    { publicSongIds: potentialSongIds, userRating: snapshot.rating },
    { enabled: potentialEnabled && potentialSongIds.length > 0 && snapshot.rating > 0, staleTime: 5 * 60 * 1000, retry: false },
  );
  const recommendations = useMemo(() => {
    const peers = potentialEnabled ? potential ?? {} : {};
    return generateRecommendations(selectedSnapshotData, peers);
  }, [selectedSnapshotData, potential, potentialEnabled]);

  // Create filter categories for the FilterPanel
  const filterCategories = useMemo(() => {
    return createRecommendationFilterCategories(
      recommendations,
      {
        difficulty: t('recommendations.filterCategories.difficulty'),
        level: t('recommendations.filterCategories.level'),
        type: t('recommendations.filterCategories.type'),
        targetRating: t('recommendations.filterCategories.targetRating'),
        achievement: t(`recommendations.filterCategories.${scoreLabel}`),
        version: t('recommendations.filterCategories.version'),
        new: t('recommendations.filters.new'),
        old: t('recommendations.filters.old'),
      },
      {
        difficulty: Layers,
        level: Hash,
        type: Disc3,
        target: Target,
        achievement: Award,
        version: Calendar,
      },
      game
    );
  }, [recommendations, t, game, scoreLabel]);

  const getFilterLabel = useCallback((filter: GenericFilter) => {
    return createRecommendationFilterLabel(filter, {
      new: t('recommendations.filters.new'),
      old: t('recommendations.filters.old'),
    }, game);
  }, [t, game]);

  const applyFilters = useCallback((filters: GenericFilter[]) => {
    return applyRecommendationFilters(recommendations, filters);
  }, [recommendations]);

  const handleAddFilter = useCallback((filter: GenericFilter) => {
    setAdvancedFilters(prev => [...prev, filter]);
  }, []);

  const handleRemoveFilter = useCallback((filter: GenericFilter) => {
    setAdvancedFilters(prev => prev.filter(f => getFilterKey(f) !== getFilterKey(filter)));
  }, []);

  // Filter recommendations based on selected category or advanced filters
  let filteredRecommendations = recommendations;

  if (flags.recommendationFilters) {
    filteredRecommendations = applyRecommendationFilters(recommendations, advancedFilters);
  } else {
    filteredRecommendations = recommendations.filter(rec => {
      switch (filterCategory) {
        case "new":
          return rec.category === "new";
        case "old":
          return rec.category === "old";
        case "best":
          return rec.isInBest;
        default:
          return true;
      }
    });
  }

  // Deduplicate recommendations by songId and difficulty
  filteredRecommendations = filteredRecommendations.filter((rec, index, self) =>
    index === self.findIndex((t) => t.song.songId === rec.song.songId && t.song.difficultyCode === rec.song.difficultyCode)
  );

  // Limit the number of recommendations to 200
  filteredRecommendations = filteredRecommendations.slice(0, 200);

  const diagnostic = JSON.stringify({
    context: 'recommendation-potential',
    region,
    version: snapshot.gameVersion,
    userRating: snapshot.rating,
    percentileEnabled: !!flags.scorePercentile,
    potentialEnabled,
    status: potentialStatus,
    fetchStatus: potentialFetchStatus,
    requestedCharts: potentialSongIds.length,
    potentialCharts: Object.keys(potential ?? {}).length,
    recordCount: baseRecommendations.length,
    qualifyingTargets: recommendations.filter(rec => rec.hasPotential).length,
    displayedPotential: filteredRecommendations.filter(rec => rec.hasPotential).length,
    err: potentialError?.message ?? null,
    recommendationRows: filteredRecommendations.map((rec, index) => {
      const peerCount = potential?.[rec.song.songId]?.peerCount;
      return [
        `${index + 1}. ${rec.song.songName}`,
        `${keyOf(game, "chartType", rec.song.typeCode).toUpperCase()} ${keyOf(game, "difficulty", rec.song.difficultyCode)} ${formatGameLevel(game, rec.song.levelPrecise, rec.song.difficultyCode)}`,
        `id=${rec.song.songId}`,
        `current=${formatGameScore(game, rec.song.scoreValue)}`,
        `target=${rec.target.label} ${formatGameScore(game, rec.target.scoreValue)}`,
        `peerReach=${rec.peerReach == null ? 'missing' : (rec.peerReach * 100).toFixed(1) + '%'}`,
        `peerCount=${peerCount ?? 0}`,
        `chartRating=${rec.song.rating}->${rec.targetRating}`,
        `gain=+${rec.ratingGain}`,
        `potential=${rec.hasPotential}`,
        `peerWeight=${rec.peerWeight.toFixed(3)}`,
        `pool=${rec.category}`,
        `inBest=${rec.isInBest}`,
        `baseEfficiency=${rec.efficiency.toFixed(2)}`,
        `efficiencyScore=${rec.efficiencyScore.toFixed(2)}`,
      ].join(' | ');
    }),
  });
  const lastDiagnostic = useRef('');
  useEffect(() => {
    if (lastDiagnostic.current === diagnostic) return;
    lastDiagnostic.current = diagnostic;
    logger.info(JSON.parse(diagnostic), '[recommendation-potential]');
  }, [diagnostic]);

  if (recommendations.length === 0) {
    return (
      <div className="space-y-6">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Heart className="h-5 w-5 text-pink-500" />
          {t('dataContent.tabs.recommendations')}
        </h2>
        <div className="text-center py-8">
          <Heart className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-medium mb-2">{t('recommendations.noRecommendations')}</h3>
          <p className="text-muted-foreground">
            {t('recommendations.allOptimal')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Heart className="h-5 w-5 text-pink-500" />
            {t('dataContent.tabs.recommendations')} ({filteredRecommendations.length})
          </h2>
          <div className="flex items-center gap-2">
            {flags.recommendationFilters && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowFilterPanel(!showFilterPanel)}
                className={cn(
                  "gap-2",
                  showFilterPanel && "bg-accent"
                )}
              >
                <Filter className="h-4 w-4" />
                {t('recommendations.filterButton')}
              </Button>
            )}
            {!flags.recommendationFilters && (
              <Select value={filterCategory} onValueChange={(value) => setFilterCategory(value as typeof filterCategory)}>
                <SelectTrigger className="w-40 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {t('recommendations.filters.all')}
                  </SelectItem>
                  <SelectItem value="best">
                    {t('recommendations.filters.best', bestBuckets)}
                  </SelectItem>
                  <SelectItem value="new">
                    {t('recommendations.filters.new')}
                  </SelectItem>
                  <SelectItem value="old">
                    {t('recommendations.filters.old')}
                  </SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
        <div className="text-sm text-muted-foreground">
          {t('recommendations.description', bestBuckets)}
        </div>

        {/* Advanced Filter Panel */}
        {flags.recommendationFilters && (
          <AnimatePresence>
            {showFilterPanel && (
              <FilterPanel
                filters={advancedFilters}
                onAddFilter={handleAddFilter}
                onRemoveFilter={handleRemoveFilter}
                categories={filterCategories}
                applyFilters={applyFilters}
                getFilterLabel={getFilterLabel}
                className="pt-4"
              />
            )}
          </AnimatePresence>
        )}
      </div>
      <div>
        <div className="divide-y divide-dashed divide-border">
          <AnimatePresence mode="popLayout">
            {filteredRecommendations.map((rec, index) => {
              const delay = STAGGER.calculateDelay(index, 0.06, 0.4);

              return (
                <motion.div
                  key={`${rec.song.songId}-${rec.song.difficultyCode}`}
                  initial={{
                    opacity: 0,
                    ...(isDesktop
                      ? { x: rec.category === "new" ? -20 : 20 }
                      : { y: rec.category === "new" ? -20 : 20 }),
                    scale: rec.isHighValue ? 0.9 : 0.95,
                  }}
                  animate={{
                    opacity: 1,
                    x: 0,
                    y: 0,
                    scale: 1,
                  }}
                  exit={{
                    opacity: 0,
                    ...(isDesktop
                      ? { x: rec.category === "new" ? 10 : -10 }
                      : { y: rec.category === "new" ? 10 : -10 }),
                    scale: 0.95,
                  }}
                  transition={getTransition({
                    type: 'spring',
                    stiffness: rec.isHighValue ? 350 : 400,
                    damping: rec.isHighValue ? 20 : 28,
                    delay,
                  })}
                  layout
                  className="overflow-hidden"
                >
                  <RecommendationRow recommendation={rec} />
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
