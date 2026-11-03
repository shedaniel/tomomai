"use client";

import { useGame, usePresentation } from "@/components/providers/game-provider";
import { GAME_UI } from "@/components/games/registry";
import { supportsGameFeature } from "@/lib/games/frontend";
import type { GameSnapshotData } from "@/lib/games/player-view";
import { formatGameScore, formatGameScoreDelta, formatGameRating, formatGameLevel, getGameDifficulty, getGameChartType, getGameRankingBuckets } from "@/lib/games/presentation";
import { rateScores, sortByRating } from "@/lib/games/ranking";
import { formatRecommendationTarget, type RecommendationChart, type RecommendationData, type UnplayedRecommendationData } from "@/lib/games/recommendations";
import { getGame } from "@/lib/games/registry";
import type { Region } from "@/lib/games/ids";
import { cn } from "@/lib/utils";
import { Award, Calendar, Disc3, Filter, Hash, Heart, Layers, Target, Users, Zap } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { CoverImage } from "@/components/cover-image";
import { createContext, memo, useContext, useState, useCallback, useMemo, type ReactNode } from "react";
import { Select, SelectContent, SelectTrigger, SelectItem, SelectValue } from "@tomomai/ui/select-friendly";
import type { Flags } from "@/lib/flags";
import { Button, TooltipFriendly, TooltipFriendlyContent, TooltipFriendlyTrigger } from "@tomomai/ui";
import { motion, AnimatePresence } from "motion/react";
import { FilterPanel, GenericFilter, getFilterKey } from "@/components/filter-panel";
import { createRecommendationFilterCategories, createRecommendationFilterLabel, applyRecommendationFilters, type FilterableRecommendation } from "./recommendation-filters";
import { useBestBucketLabels } from "./recommendation-buckets";
import { RecommendationCardSkeleton } from "./recommendation-card.skeleton";
import { STAGGER, getTransition } from "@/lib/animation-constants";
import { trpc } from "@/lib/trpc-client";
import { useMediaQuery } from "@/hooks/use-media-query";
import { Tabs, TabsList, TabsTrigger } from "@/components/animate-ui/components/radix/tabs";

const MAX_ROWS = 200;

export type RecommendationSource = { kind: "own" } | { kind: "public"; username: string };

type RecommendationTab = "improve" | "tryNew";

/** The viewer's rating for score comparisons loaded when a hover opens, null when they're off. */
const ComparisonRatingContext = createContext<number | null>(null);

function SongInfo({ song, category, isInBest, peerReach, stretch = false }: {
  song: RecommendationChart;
  category: "new" | "old";
  isInBest: boolean;
  peerReach: number | null;
  stretch?: boolean;
}) {
  const t = useTranslations('recommendations');
  const tBucket = useTranslations('dataContent.rankingBucket');
  const format = useFormatter();
  const game = useGame().id;
  const [newBucket, oldBucket] = getGameRankingBuckets(game);
  const chartType = getGameChartType(game, song.typeCode);
  const difficulty = getGameDifficulty(game, song.difficultyCode);
  return (
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
          {peerReach != null && (
            <span className="inline-flex shrink-0 whitespace-nowrap rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary dark:bg-primary/20">
              {t('peerAchieved', { percent: format.number(peerReach, { style: 'percent', maximumFractionDigits: 0 }) })}
            </span>
          )}
          {stretch && (
            <span className="inline-flex shrink-0 whitespace-nowrap rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-600/30 dark:text-amber-400">
              {t('stretchBadge')}
            </span>
          )}
        </div>
        <div className="text-muted-foreground text-xs truncate">
          {!chartType.implicit && `${chartType.label} • `}{difficulty.shortLabel} {formatGameLevel(game, song.levelPrecise, song.difficultyCode)} • {song.artist}
        </div>
      </div>
    </div>
  );
}

const ROW_CLASS = "flex xs:justify-between xs:items-center text-sm min-h-16 py-2 max-xs:min-h-30 max-xs:flex-col max-xs:justify-start max-xs:gap-y-2 px-2 -mx-2 rounded-md cursor-pointer group";

function RecommendationRow({ recommendation }: { recommendation: RecommendationData }) {
  const t = useTranslations('recommendations');
  const game = useGame().id;
  const userRating = useContext(ComparisonRatingContext);
  const { song, target, targetRating, ratingGain, isInBest, category } = recommendation;
  const { ScoreHover } = GAME_UI[game];
  return (
    <ScoreHover score={song} percentileSource={userRating == null ? undefined : { userRating, scoreValue: song.scoreValue }}>
      <motion.div className={ROW_CLASS}>
        <SongInfo song={song} category={category} isInBest={isInBest} peerReach={recommendation.hasPotential ? recommendation.peerReach : null} />

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
              <Target className="h-3 w-3 shrink-0 text-amber-500" />
              {target.kind === "combo" ? (
                <span className="text-orange-400 font-semibold">{target.label}</span>
              ) : (
                <span>+{formatGameScoreDelta(game, song.scoreValue, target.scoreValue)}</span>
              )}
            </div>
            <div className="text-xs flex items-center gap-1">
              <Zap className="h-3 w-3 shrink-0 text-green-500" />
              <span className="font-mono font-semibold">+{formatGameRating(game, ratingGain)}</span>
            </div>
          </div>
        </div>
      </motion.div>
    </ScoreHover>
  );
}

function UnplayedRow({ recommendation }: { recommendation: UnplayedRecommendationData }) {
  const t = useTranslations('recommendations');
  const game = useGame().id;
  const userRating = useContext(ComparisonRatingContext);
  const { song, target, targetRating, replacedRating, ratingGain, category, peerMedianScore } = recommendation;
  const { ScoreHover } = GAME_UI[game];
  const peerScore = peerMedianScore == null ? null : formatGameScore(game, peerMedianScore, { precision: "compact" });
  return (
    <ScoreHover score={song} percentileSource={userRating == null ? undefined : { userRating, scoreValue: null }}>
      <motion.div className={ROW_CLASS}>
        <SongInfo song={song} category={category} isInBest={false} peerReach={recommendation.peerReach} stretch={recommendation.stretch} />

        <div className="flex items-center justify-between">
          <div className="xs:text-right xs:ml-2">
            <div className="text-xs text-muted-foreground">{t('target')}</div>
            <div className="font-mono text-xs">
              <span className="text-green-600 dark:text-green-400">{formatRecommendationTarget(game, target)}</span>
            </div>
            <div className="font-mono text-xs">
              {formatGameRating(game, replacedRating)} → <span className="text-green-600 dark:text-green-400">{formatGameRating(game, targetRating)}</span>
            </div>
          </div>

          <div className="text-right ml-4 mr-2 space-y-0.5 w-20">
            {peerScore != null && (
              <TooltipFriendly>
                <TooltipFriendlyTrigger asChild>
                  <div className="text-xs text-muted-foreground flex items-center gap-1 cursor-help">
                    <Users className="h-3 w-3 shrink-0 text-sky-500" />
                    <span>{peerScore}</span>
                  </div>
                </TooltipFriendlyTrigger>
                <TooltipFriendlyContent side="top" className="max-w-64" title={song.songName}>
                  {t('peerTypical', { score: peerScore })}
                </TooltipFriendlyContent>
              </TooltipFriendly>
            )}
            <div className="text-xs flex items-center gap-1">
              <Zap className="h-3 w-3 shrink-0 text-green-500" />
              <span className="font-mono font-semibold">+{formatGameRating(game, ratingGain)}</span>
            </div>
          </div>
        </div>
      </motion.div>
    </ScoreHover>
  );
}

function AnimatedRowsImpl<T extends FilterableRecommendation & { ratingGain: number; song: { songId: string } }>({ items, render }: {
  items: T[];
  render: (item: T) => ReactNode;
}) {
  const isDesktop = useMediaQuery("(min-width: 768px)", { initializeWithValue: false });
  const { highValueRatingGain } = getGame(useGame().id).recommendations;
  return (
    <div className="divide-y divide-dashed divide-border">
      <AnimatePresence mode="popLayout">
        {items.map((rec, index) => {
          const isHighValue = rec.ratingGain >= highValueRatingGain;
          const delay = STAGGER.calculateDelay(index, 0.06, 0.4);

          return (
            <motion.div
              key={`${rec.song.songId}-${rec.song.difficultyCode}`}
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
              {render(rec)}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

// Memoized with stable render callbacks so tab switches and header updates skip the rows' layout animations
const AnimatedRows = memo(AnimatedRowsImpl) as typeof AnimatedRowsImpl;
const renderImproveRow = (rec: RecommendationData) => <RecommendationRow recommendation={rec} />;
const renderUnplayedRow = (rec: UnplayedRecommendationData) => <UnplayedRow recommendation={rec} />;

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="text-center py-8">
      <Heart className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
      <h3 className="text-lg font-medium mb-2">{title}</h3>
      <p className="text-muted-foreground">{description}</p>
    </div>
  );
}

function dedupeByChart<T extends { song: { songId: string; difficultyCode: number } }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter(item => {
    const key = `${item.song.songId}-${item.song.difficultyCode}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

type FilterCategory = "all" | "new" | "old" | "best";

function filterRecommendations<T extends RecommendationData | UnplayedRecommendationData>(
  list: T[],
  useAdvancedFilters: boolean,
  advancedFilters: GenericFilter[],
  filterCategory: FilterCategory,
): T[] {
  if (useAdvancedFilters) return applyRecommendationFilters(list, advancedFilters);
  return list.filter(rec => {
    switch (filterCategory) {
      case "new":
        return rec.category === "new";
      case "old":
        return rec.category === "old";
      case "best":
        return "isInBest" in rec ? rec.isInBest : true;
      default:
        return true;
    }
  });
}

function useRecommendations(selectedSnapshotData: GameSnapshotData, region: Region, source: RecommendationSource, usePeers: boolean) {
  const game = useGame().id;
  const options = { staleTime: 5 * 60 * 1000, retry: false } as const;
  const own = trpc.user.getRecommendations.useQuery(
    { game, region, snapshotId: selectedSnapshotData.snapshot.publicId, usePeers },
    { ...options, enabled: source.kind === "own" },
  );
  const publicQuery = trpc.user.getPublicRecommendations.useQuery(
    { game, region, username: source.kind === "public" ? source.username : "", usePeers },
    { ...options, enabled: source.kind === "public" },
  );
  return source.kind === "own" ? own : publicQuery;
}

export function RecommendationCard({ selectedSnapshotData, flags, region, source }: {
  selectedSnapshotData: GameSnapshotData;
  flags: Flags;
  region: Region;
  source: RecommendationSource;
}) {
  const t = useTranslations();
  const frontendGame = useGame();
  const game = frontendGame.id;
  const { scoreLabel } = usePresentation();
  const bestBuckets = useBestBucketLabels();
  const [tab, setTab] = useState<RecommendationTab>("improve");
  const [visitedTabs, setVisitedTabs] = useState<ReadonlySet<RecommendationTab>>(() => new Set(["improve"]));
  const [filterCategory, setFilterCategory] = useState<FilterCategory>("all");
  const [advancedFilters, setAdvancedFilters] = useState<GenericFilter[]>([]);
  const [showFilterPanel, setShowFilterPanel] = useState(false);

  const { songs, snapshot } = selectedSnapshotData;
  const usePeers = !!flags.scorePercentile && supportsGameFeature(frontendGame, "percentiles", region);
  const { data, isPending, isError } = useRecommendations(selectedSnapshotData, region, source, usePeers);

  const songsById = useMemo(
    () => new Map(sortByRating(rateScores(game, songs, snapshot.gameVersion)).map(song => [song.songId, song])),
    [game, songs, snapshot.gameVersion],
  );

  const improve = useMemo<RecommendationData[]>(() => (data?.improve ?? []).flatMap(({ songId, ...rec }) => {
    const song = songsById.get(songId);
    return song ? [{ ...rec, song }] : [];
  }), [data?.improve, songsById]);
  const tryNew = data?.tryNew ?? null;
  const activeTab: RecommendationTab = tab === "tryNew" && tryNew ? "tryNew" : "improve";
  // Unplayed charts can't be in the best buckets, so that option falls back to all there and returns on Improve
  const tryNewFilter: FilterCategory = filterCategory === "best" ? "all" : filterCategory;
  const activeFilter = activeTab === "tryNew" ? tryNewFilter : filterCategory;
  const activeList = useMemo<(RecommendationData | UnplayedRecommendationData)[]>(
    () => activeTab === "tryNew" ? tryNew ?? [] : improve,
    [activeTab, tryNew, improve],
  );

  const filterCategories = useMemo(() => {
    return createRecommendationFilterCategories(
      activeList,
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
  }, [activeList, t, game, scoreLabel]);

  const getFilterLabel = useCallback((filter: GenericFilter) => {
    return createRecommendationFilterLabel(filter, {
      new: t('recommendations.filters.new'),
      old: t('recommendations.filters.old'),
    }, game);
  }, [t, game]);

  const applyFilters = useCallback((filters: GenericFilter[]) => {
    return applyRecommendationFilters(activeList, filters);
  }, [activeList]);

  const handleAddFilter = useCallback((filter: GenericFilter) => {
    setAdvancedFilters(prev => [...prev, filter]);
  }, []);

  const handleRemoveFilter = useCallback((filter: GenericFilter) => {
    setAdvancedFilters(prev => prev.filter(f => getFilterKey(f) !== getFilterKey(filter)));
  }, []);

  const filteredImprove = useMemo(
    () => dedupeByChart(filterRecommendations(improve, flags.recommendationFilters, advancedFilters, filterCategory)).slice(0, MAX_ROWS),
    [improve, flags.recommendationFilters, advancedFilters, filterCategory],
  );
  const filteredTryNew = useMemo(
    () => filterRecommendations(tryNew ?? [], flags.recommendationFilters, advancedFilters, tryNewFilter).slice(0, MAX_ROWS),
    [tryNew, flags.recommendationFilters, advancedFilters, tryNewFilter],
  );

  if (isPending) return <RecommendationCardSkeleton />;

  if (isError) {
    return (
      <div className="space-y-6">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Heart className="h-5 w-5 text-pink-500" />
          {t('dataContent.tabs.recommendations')}
        </h2>
        <div className="text-center py-8 text-muted-foreground">
          {t('recommendations.loadError')}
        </div>
      </div>
    );
  }

  const visibleCount = activeTab === "tryNew" ? filteredTryNew.length : filteredImprove.length;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Heart className="h-5 w-5 text-pink-500" />
            {t('dataContent.tabs.recommendations')} ({visibleCount})
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
              <Select value={activeFilter} onValueChange={(value) => setFilterCategory(value as FilterCategory)}>
                <SelectTrigger className="w-40 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {t('recommendations.filters.all')}
                  </SelectItem>
                  {activeTab === "improve" && (
                    <SelectItem value="best">
                      {t('recommendations.filters.best', bestBuckets)}
                    </SelectItem>
                  )}
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
          {activeTab === "tryNew" ? t('recommendations.tryNewDescription') : t('recommendations.description', bestBuckets)}
        </div>

        {tryNew && (
          <Tabs
            value={activeTab}
            onValueChange={(value) => {
              setTab(value as RecommendationTab);
              setVisitedTabs(prev => new Set(prev).add(value as RecommendationTab));
            }}
            className="pt-4"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="improve">{t('recommendations.tabs.improve')}</TabsTrigger>
              <TabsTrigger value="tryNew">{t('recommendations.tabs.tryNew')}</TabsTrigger>
            </TabsList>
          </Tabs>
        )}

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
      <ComparisonRatingContext.Provider value={usePeers && snapshot.rating > 0 ? snapshot.rating : null}>
        {/* Visited lists stay mounted so switching tabs doesn't remount and re-animate hundreds of rows */}
        <div hidden={activeTab !== "improve"}>
          {improve.length === 0 ? (
            <EmptyState title={t('recommendations.noRecommendations')} description={t('recommendations.allOptimal')} />
          ) : (
            <AnimatedRows items={filteredImprove} render={renderImproveRow} />
          )}
        </div>
        {tryNew && visitedTabs.has("tryNew") && (
          <div hidden={activeTab !== "tryNew"}>
            {tryNew.length === 0 ? (
              <EmptyState title={t('recommendations.noUnplayed')} description={t('recommendations.noUnplayedDescription')} />
            ) : (
              <AnimatedRows items={filteredTryNew} render={renderUnplayedRow} />
            )}
          </div>
        )}
      </ComparisonRatingContext.Provider>
    </div>
  );
}
