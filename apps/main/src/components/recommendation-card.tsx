"use client";

import { addRatingsAndSort, SongWithRating } from "@/lib/rating-calculator";
import { generateRecommendations, RecommendationData } from "@/server/queries/recommendations";
import { SnapshotWithSongs } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Award, Calendar, Disc3, Filter, Hash, Heart, Layers, Target, Zap } from "lucide-react";
import { useTranslations } from "next-intl";
import { CoverImage } from "@/components/cover-image";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Select, SelectContent, SelectTrigger, SelectItem, SelectValue } from "@tomomai/ui/select-friendly";
import { Flags } from "@/lib/flags";
import { Button } from "@tomomai/ui";
import { motion, AnimatePresence } from "motion/react";
import {
  FilterPanel,
  GenericFilter,
  getFilterKey,
  createRecommendationFilterCategories,
  createRecommendationFilterLabel,
  applyRecommendationFilters,
} from "@/components/filter-panel";
import { SongHoverCard } from "@/components/song-hover-card";
import { renderLevelPrecise } from "@/lib/name-utils";
import { STAGGER, getTransition } from "@/lib/animation-constants";
import { useMediaQuery } from "@/hooks/use-media-query";

// Floor to 2 decimals so 99.9956% doesn't render as 100.00%
function formatAccuracy(accuracy: number): string {
  return (Math.floor(accuracy * 100) / 100).toFixed(2);
}

function RecommendationRow({ recommendation }: { recommendation: RecommendationData }) {
  const { song, currentAccuracy, targetAccuracy, currentRating, targetRating, accuracyDiff, ratingGain, isInBest, category } = recommendation;
  return (
    <SongHoverCard song={song}>
      <motion.div
        className="flex xs:justify-between xs:items-center text-sm h-16 max-xs:h-30 max-xs:flex-col max-xs:justify-start max-xs:gap-y-2 px-2 -mx-2 rounded-md cursor-pointer group"
      >
        <div className="flex items-center xs:flex-1 min-w-0 h-12 max-xs:mt-1.5">
          <CoverImage
            coverUrl={song.cover}
            alt={song.songName}
            className={cn(
              "w-8 h-8 ml-1 mr-3 rounded ring-2 ring-offset-2 ring-offset-background",
              song.difficulty === "basic" && "ring-green-400",
              song.difficulty === "advanced" && "ring-yellow-400",
              song.difficulty === "expert" && "ring-red-400",
              song.difficulty === "master" && "ring-purple-500",
              song.difficulty === "remaster" && "ring-purple-200",
              song.difficulty === "utage" && "ring-pink-400",
            )}
            width={36}
            height={36}
            loading="lazy"
          />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <div className="truncate font-medium">{song.songName}</div>
              <div className={cn(
                "px-1.5 py-0.5 rounded text-xs font-medium whitespace-nowrap",
                category === "new" ? "bg-lime-100 text-lime-800 dark:bg-lime-600/30 dark:text-lime-400" : "bg-orange-100 text-orange-800 dark:bg-orange-600/30 dark:text-orange-400"
              )}>
                {category === "new" ? "New" : "Old"}
              </div>
              {category === "new" && isInBest && (
                <div className="px-1.5 py-0.5 rounded text-xs font-medium whitespace-nowrap bg-green-100 text-green-800 dark:bg-green-600/30 dark:text-green-400">
                  B15
                </div>
              )}
              {category === "old" && isInBest && (
                <div className="px-1.5 py-0.5 rounded text-xs font-medium whitespace-nowrap bg-red-100 text-red-800 dark:bg-red-600/30 dark:text-red-400">
                  B35
                </div>
              )}
            </div>
            <div className="text-muted-foreground text-xs truncate">
              {song.type.toUpperCase()} • {song.difficulty.slice(0, 3).toUpperCase()} {renderLevelPrecise(song.levelPrecise, song.difficulty)} • {song.artist}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="xs:text-right xs:ml-2">
            <div className="text-xs text-muted-foreground">Current → Target</div>
            <div className="font-mono text-xs">
              {formatAccuracy(currentAccuracy)}% → {targetAccuracy === 101.0 ? (
                <span className="text-green-600 dark:text-green-400">AP</span>
              ) : (
                <span className="text-green-600 dark:text-green-400">{formatAccuracy(targetAccuracy)}%</span>
              )}
            </div>
            <div className="font-mono text-xs">
              {currentRating} → <span className="text-green-600 dark:text-green-400">{targetRating}</span>
            </div>
          </div>

          <div className="text-right ml-4 mr-2 space-y-0.5 w-16">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Target className="h-3 w-3 text-amber-500" />
              {targetAccuracy === 101.0 ? (
                <span className="text-orange-400 font-semibold">AP</span>
              ) : (
                <span>+{(Math.floor(targetAccuracy * 100) / 100 - Math.floor(currentAccuracy * 100) / 100).toFixed(2)}%</span>
              )}
            </div>
            <div className="text-xs flex items-center gap-1">
              <Zap className="h-3 w-3 text-green-500" />
              <span className="font-mono font-semibold">+{ratingGain}</span>
            </div>
          </div>
        </div>
      </motion.div>
    </SongHoverCard>
  );
}

export function RecommendationCard({ selectedSnapshotData, flags }: { selectedSnapshotData: SnapshotWithSongs, flags: Flags }) {
  const t = useTranslations();
  const isDesktop = useMediaQuery("(min-width: 768px)", { initializeWithValue: false });
  const [filterCategory, setFilterCategory] = useState<"all" | "new" | "old" | "best">("all");
  const [advancedFilters, setAdvancedFilters] = useState<GenericFilter[]>([]);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const hasMountedRef = useRef(false);

  useEffect(() => {
    hasMountedRef.current = true;
  }, []);

  const { songs, snapshot } = selectedSnapshotData;
  const songsWithRating: SongWithRating[] = addRatingsAndSort(songs, snapshot.gameVersion);

  const recommendations = useMemo(
    () => generateRecommendations(songsWithRating, snapshot.gameVersion),
    [songsWithRating, snapshot.gameVersion]
  );

  // Create filter categories for the FilterPanel
  const filterCategories = useMemo(() => {
    return createRecommendationFilterCategories(
      recommendations,
      {
        difficulty: t('recommendations.filterCategories.difficulty'),
        level: t('recommendations.filterCategories.level'),
        type: t('recommendations.filterCategories.type'),
        targetRating: t('recommendations.filterCategories.targetRating'),
        achievement: t('recommendations.filterCategories.achievement'),
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
      }
    );
  }, [recommendations, t]);

  const getFilterLabel = useCallback((filter: GenericFilter) => {
    return createRecommendationFilterLabel(filter, {
      new: t('recommendations.filters.new'),
      old: t('recommendations.filters.old'),
    });
  }, [t]);

  const applyFilters = useCallback((filters: GenericFilter[]) => {
    return applyRecommendationFilters(recommendations, filters);
  }, []);

  const handleAddFilter = useCallback((filter: GenericFilter) => {
    setAdvancedFilters(prev => [...prev, filter]);
  }, []);

  const handleRemoveFilter = useCallback((filter: GenericFilter) => {
    setAdvancedFilters(prev => prev.filter(f => getFilterKey(f) !== getFilterKey(filter)));
  }, []);

  // Filter recommendations based on selected category or advanced filters
  let filteredRecommendations = recommendations;

  if (flags.recommendationFilters) {
    filteredRecommendations = applyFilters(advancedFilters);
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
    index === self.findIndex((t) => t.song.songId === rec.song.songId && t.song.difficulty === rec.song.difficulty)
  );

  // Limit the number of recommendations to 200
  filteredRecommendations = filteredRecommendations.slice(0, 200);

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
                    {t('recommendations.filters.best')}
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
          {t('recommendations.description')}
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
              // High-value recommendations get a more prominent animation
              const isHighValue = rec.ratingGain >= 50;
              const delay = STAGGER.calculateDelay(index, 0.06, 0.4);

              return (
                <motion.div
                  key={`${rec.song.songId}-${rec.song.difficulty}`}
                  initial={{
                    opacity: 0,
                    ...(isDesktop
                      ? { x: rec.category === "new" ? -20 : 20 }
                      : { y: rec.category === "new" ? -20 : 20 }),
                    scale: isHighValue ? 0.9 : 0.95,
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
                    stiffness: isHighValue ? 350 : 400,
                    damping: isHighValue ? 20 : 28,
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
