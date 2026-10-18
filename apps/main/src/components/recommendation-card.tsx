"use client";

import { addRatingsAndSort, SongWithRating } from "@/lib/rating-calculator";
import type { RecommendationData, UnplayedRecommendationData } from "@/server/queries/recommendations";
import { Region, SnapshotWithSongs, SongBase } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Award, Calendar, Disc3, Filter, Hash, Heart, Layers, Target, Users, Zap } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { CoverImage } from "@/components/cover-image";
import { createContext, memo, useContext, useState, useCallback, useMemo } from "react";
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
  type FilterableRecommendation,
} from "@/components/filter-panel";
import { SongHoverCard } from "@/components/song-hover-card";
import { renderLevelPrecise } from "@/lib/name-utils";
import { STAGGER, getTransition } from "@/lib/animation-constants";
import { trpc } from "@/lib/trpc-client";
import { useMediaQuery } from "@/hooks/use-media-query";
import { Tabs, TabsList, TabsTrigger } from "@/components/animate-ui/components/radix/tabs";
import { RecommendationCardSkeleton } from "@/components/recommendation-card.skeleton";

const MAX_ROWS = 200;

export type RecommendationSource = { kind: "own" } | { kind: "public"; username: string };

type RecommendationTab = "improve" | "tryNew";

/** Viewer's Rating for on-demand score comparisons in hover cards, null when they're disabled. */
const PercentileRatingContext = createContext<number | null>(null);

// Floor to 2 decimals so 99.9956% doesn't render as 100.00%
function formatAccuracy(accuracy: number): string {
  return (Math.floor(accuracy * 100) / 100).toFixed(2);
}

function SongInfo({ song, category, isInBest, peerReach, stretch = false }: {
  song: SongBase;
  category: "new" | "old";
  isInBest: boolean;
  peerReach: number | null;
  stretch?: boolean;
}) {
  const t = useTranslations('recommendations');
  const format = useFormatter();
  return (
    <div className="flex items-center xs:flex-1 min-w-0 min-h-12 max-xs:mt-1.5">
      <CoverImage
        coverUrl={song.cover}
        alt={song.songName}
        className={cn(
          "w-8 h-8 shrink-0 ml-1 mr-3 rounded ring-2 ring-offset-2 ring-offset-background",
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
              B15
            </div>
          )}
          {category === "old" && isInBest && (
            <div className="px-1.5 py-0.5 rounded text-xs font-medium whitespace-nowrap bg-red-100 text-red-800 dark:bg-red-600/30 dark:text-red-400">
              B35
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
          {song.type.toUpperCase()} • {song.difficulty.slice(0, 3).toUpperCase()} {renderLevelPrecise(song.levelPrecise, song.difficulty)} • {song.artist}
        </div>
      </div>
    </div>
  );
}

const ROW_CLASS = "flex xs:justify-between xs:items-center text-sm min-h-16 py-2 max-xs:min-h-30 max-xs:flex-col max-xs:justify-start max-xs:gap-y-2 px-2 -mx-2 rounded-md cursor-pointer group";

function RecommendationRow({ recommendation }: { recommendation: RecommendationData }) {
  const t = useTranslations('recommendations');
  const { song, currentAccuracy, targetAccuracy, currentRating, targetRating, ratingGain, isInBest, category } = recommendation;
  const userRating = useContext(PercentileRatingContext);
  return (
    <SongHoverCard song={song} percentileSource={userRating == null ? undefined : { userRating, achievement: song.achievement }}>
      <motion.div className={ROW_CLASS}>
        <SongInfo song={song} category={category} isInBest={isInBest} peerReach={recommendation.hasPotential ? recommendation.peerReach : null} />

        <div className="flex items-center justify-between">
          <div className="xs:text-right xs:ml-2">
            <div className="text-xs text-muted-foreground">{t('currentToTarget')}</div>
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
              <Target className="h-3 w-3 shrink-0 text-amber-500" />
              {targetAccuracy === 101.0 ? (
                <span className="text-orange-400 font-semibold">AP</span>
              ) : (
                <span>+{(Math.floor(targetAccuracy * 100) / 100 - Math.floor(currentAccuracy * 100) / 100).toFixed(2)}%</span>
              )}
            </div>
            <div className="text-xs flex items-center gap-1">
              <Zap className="h-3 w-3 shrink-0 text-green-500" />
              <span className="font-mono font-semibold">+{ratingGain}</span>
            </div>
          </div>
        </div>
      </motion.div>
    </SongHoverCard>
  );
}

function UnplayedRow({ recommendation }: { recommendation: UnplayedRecommendationData }) {
  const t = useTranslations('recommendations');
  const { song, targetAccuracy, targetRating, replacedRating, ratingGain, category, peerMedianAccuracy } = recommendation;
  const userRating = useContext(PercentileRatingContext);
  return (
    <SongHoverCard song={song} percentileSource={userRating == null ? undefined : { userRating, achievement: null }}>
      <motion.div className={ROW_CLASS}>
        <SongInfo song={song} category={category} isInBest={false} peerReach={recommendation.peerReach} stretch={recommendation.stretch} />

        <div className="flex items-center justify-between">
          <div className="xs:text-right xs:ml-2">
            <div className="text-xs text-muted-foreground">{t('target')}</div>
            <div className="font-mono text-xs">
              <span className="text-green-600 dark:text-green-400">{formatAccuracy(targetAccuracy)}%</span>
            </div>
            <div className="font-mono text-xs">
              {replacedRating} → <span className="text-green-600 dark:text-green-400">{targetRating}</span>
            </div>
          </div>

          <div className="text-right ml-4 mr-2 space-y-0.5 w-20">
            {peerMedianAccuracy != null && (
              <div className="text-xs text-muted-foreground flex items-center gap-1" title={t('peerTypical', { accuracy: formatAccuracy(peerMedianAccuracy) })}>
                <Users className="h-3 w-3 shrink-0 text-sky-500" />
                <span>{formatAccuracy(peerMedianAccuracy)}%</span>
              </div>
            )}
            <div className="text-xs flex items-center gap-1">
              <Zap className="h-3 w-3 shrink-0 text-green-500" />
              <span className="font-mono font-semibold">+{ratingGain}</span>
            </div>
          </div>
        </div>
      </motion.div>
    </SongHoverCard>
  );
}

function AnimatedRowsImpl<T extends FilterableRecommendation & { ratingGain: number; song: { songId: string } }>({ items, render }: {
  items: T[];
  render: (item: T) => React.ReactNode;
}) {
  const isDesktop = useMediaQuery("(min-width: 768px)", { initializeWithValue: false });
  return (
    <div className="divide-y divide-dashed divide-border">
      <AnimatePresence mode="popLayout">
        {items.map((rec, index) => {
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

function dedupeByChart<T extends { song: { songId: string; difficulty: string } }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter(item => {
    const key = `${item.song.songId}-${item.song.difficulty}`;
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

function useRecommendations(selectedSnapshotData: SnapshotWithSongs, region: Region, source: RecommendationSource, usePeers: boolean) {
  const { snapshot } = selectedSnapshotData;
  const options = { staleTime: 5 * 60 * 1000, retry: false } as const;
  const own = trpc.user.getRecommendations.useQuery(
    { snapshotId: snapshot.id, region, usePeers },
    { ...options, enabled: source.kind === "own" },
  );
  const publicQuery = trpc.user.getPublicRecommendations.useQuery(
    { username: source.kind === "public" ? source.username : "", region, usePeers },
    { ...options, enabled: source.kind === "public" },
  );
  return source.kind === "own" ? own : publicQuery;
}

export function RecommendationCard({ selectedSnapshotData, flags, region, source }: {
  selectedSnapshotData: SnapshotWithSongs;
  flags: Flags;
  region: Region;
  source: RecommendationSource;
}) {
  const t = useTranslations();
  const [tab, setTab] = useState<RecommendationTab>("improve");
  const [visitedTabs, setVisitedTabs] = useState<ReadonlySet<RecommendationTab>>(() => new Set(["improve"]));
  const [filterCategory, setFilterCategory] = useState<FilterCategory>("all");
  const [advancedFilters, setAdvancedFilters] = useState<GenericFilter[]>([]);
  const [showFilterPanel, setShowFilterPanel] = useState(false);

  const { songs, snapshot } = selectedSnapshotData;
  const { data, isPending, isError } = useRecommendations(selectedSnapshotData, region, source, !!flags.scorePercentile);

  const songsById = useMemo(() => {
    const map = new Map<string, SongWithRating>();
    for (const song of addRatingsAndSort(songs, snapshot.gameVersion)) map.set(song.songId, song);
    return map;
  }, [songs, snapshot.gameVersion]);

  const improve = useMemo<RecommendationData[]>(() => (data?.improve ?? []).flatMap(({ songId, ...rec }) => {
    const song = songsById.get(songId);
    return song ? [{ ...rec, song }] : [];
  }), [data?.improve, songsById]);
  const tryNew = data?.tryNew ?? null;
  const activeTab: RecommendationTab = tab === "tryNew" && tryNew ? "tryNew" : "improve";
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
  }, [activeList, t]);

  const getFilterLabel = useCallback((filter: GenericFilter) => {
    return createRecommendationFilterLabel(filter, {
      new: t('recommendations.filters.new'),
      old: t('recommendations.filters.old'),
    });
  }, [t]);

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
    () => filterRecommendations(tryNew ?? [], flags.recommendationFilters, advancedFilters, filterCategory).slice(0, MAX_ROWS),
    [tryNew, flags.recommendationFilters, advancedFilters, filterCategory],
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
              <Select value={filterCategory} onValueChange={(value) => setFilterCategory(value as typeof filterCategory)}>
                <SelectTrigger className="w-40 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {t('recommendations.filters.all')}
                  </SelectItem>
                  {activeTab === "improve" && (
                    <SelectItem value="best">
                      {t('recommendations.filters.best')}
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
          {t(activeTab === "tryNew" ? 'recommendations.tryNewDescription' : 'recommendations.description')}
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
      <PercentileRatingContext.Provider value={flags.scorePercentile && snapshot.rating > 0 ? snapshot.rating : null}>
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
      </PercentileRatingContext.Provider>
    </div>
  );
}
