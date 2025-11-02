"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { addRatingsAndSort, getRatingFactor, SongWithRating, splitSongs } from "@/lib/rating-calculator";
import { SnapshotWithSongs } from "@/lib/types";
import { cn, createSafeMaimaiImageUrl } from "@/lib/utils";
import { Award, Calendar, Disc3, Filter, Hash, Heart, Layers, Target, X, Zap } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useState, useEffect, useRef } from "react";
import { Select, SelectContent, SelectTrigger, SelectItem, SelectValue } from "./ui/select-friendly";
import { Flags } from "@/lib/flags";
import { Button } from "./ui/button";
import { motion, AnimatePresence } from "motion/react";

interface RecommendationData {
  song: SongWithRating;
  currentAccuracy: number;
  targetAccuracy: number;
  currentRating: number;
  targetRating: number;
  accuracyDiff: number;
  ratingGain: number;
  isInBest: boolean;
  category: "new" | "old";
  efficiency: number;
  order: number;
}

const ACCURACY_VALUES = [
    94.0,
    97.0,
    98.0,
    99.0,
    99.5,
    100.0,
    100.5,
    101.0,
]

type FilterType = 
  | { type: "difficulty"; value: "basic" | "advanced" | "expert" | "master" | "remaster" }
  | { type: "level"; value: string }
  | { type: "type"; value: "std" | "dx" }
  | { type: "target"; value: string }
  | { type: "achievement"; value: string }
  | { type: "version"; value: "new" | "old" };

const DIFFICULTY_OPTIONS = ["basic", "advanced", "expert", "master", "remaster"] as const;
const TYPE_OPTIONS = ["std", "dx"] as const;
const VERSION_OPTIONS = [
  { value: "new", label: "New Songs" },
  { value: "old", label: "Old Songs" }
] as const;
const ACHIEVEMENT_OPTIONS = [
  { value: "97.0", label: "S" },
  { value: "98.0", label: "S+" },
  { value: "99.0", label: "SS" },
  { value: "99.5", label: "SS+" },
  { value: "100.0", label: "SSS" },
  { value: "100.5", label: "SSS+" },
  { value: "101.0", label: "AP" }
] as const;

function generateLevelOptions(songs: SongWithRating[]): string[] {
  const levels = new Set<string>();
  songs.forEach(song => {
    const level = song.levelPrecise / 10;
    const isPlus = level % 1 >= 0.6;
    const baseLevel = Math.floor(level);
    levels.add(isPlus ? `${baseLevel}+` : `${baseLevel}`);
  });
  return Array.from(levels).sort((a, b) => {
    const aNum = parseFloat(a.replace('+', '.5'));
    const bNum = parseFloat(b.replace('+', '.5'));
    return aNum - bNum;
  });
}

function generateTargetOptions(recommendations: RecommendationData[]): string[] {
  const targets = new Set<number>();
  recommendations.forEach(rec => {
    const rangeStart = Math.floor(rec.targetRating / 10) * 10;
    targets.add(rangeStart);
  });
  return Array.from(targets).sort((a, b) => a - b).map(t => `${t} - ${t + 9}`);
}

function getFilterLabel(filter: FilterType, t: ReturnType<typeof useTranslations>): string {
  switch (filter.type) {
    case "difficulty":
      const difficultyMap = {
        basic: "Easy",
        advanced: "Advanced",
        expert: "Expert",
        master: "Master",
        remaster: "Re:Master"
      };
      return difficultyMap[filter.value as keyof typeof difficultyMap] || filter.value;
    case "level":
      return `Lv ${filter.value}`;
    case "type":
      return filter.value.toUpperCase();
    case "target":
      return filter.value;
    case "achievement": {
      const achievement = ACHIEVEMENT_OPTIONS.find(opt => opt.value === filter.value);
      return achievement ? achievement.label : filter.value;
    }
    case "version":
      return filter.value === "new" ? t('recommendations.filters.new') : t('recommendations.filters.old');
  }
}

function getFilterKey(filter: FilterType): string {
  return `${filter.type}-${filter.value}`;
}

function applyFilters(recommendations: RecommendationData[], filters: FilterType[]): RecommendationData[] {
  if (filters.length === 0) return recommendations;

  // Group filters by category
  const filtersByCategory = filters.reduce((acc, filter) => {
    if (!acc[filter.type]) {
      acc[filter.type] = [];
    }
    acc[filter.type].push(filter);
    return acc;
  }, {} as Record<string, FilterType[]>);

  return recommendations.filter(rec => {
    // For each category, at least one filter must match (OR within category)
    // All categories must have a match (AND across categories)
    return Object.entries(filtersByCategory).every(([category, categoryFilters]) => {
      return categoryFilters.some(filter => {
        switch (filter.type) {
          case "difficulty":
            return rec.song.difficulty === filter.value;
          case "level": {
            const level = rec.song.levelPrecise / 10;
            const isPlus = level % 1 >= 0.6;
            const baseLevel = Math.floor(level);
            const levelStr = isPlus ? `${baseLevel}+` : `${baseLevel}`;
            return levelStr === filter.value;
          }
          case "type":
            return rec.song.type === filter.value;
          case "target": {
            const [min, max] = filter.value.split(' - ').map(Number);
            return rec.targetRating >= min && rec.targetRating <= max;
          }
          case "achievement":
            return rec.targetAccuracy === parseFloat(filter.value);
          case "version":
            return rec.category === filter.value;
        }
      });
    });
  });
}

function generateRecommendations(songsWithRating: SongWithRating[], version: number): RecommendationData[] {
  // Get B15/B35 and minimum required ratings
  const { newSongsB15, oldSongsB35, newSongsRemaining, oldSongsRemaining } = splitSongs(songsWithRating, version);
  
  const minNewRating = newSongsB15.length > 0 ? Math.min(...newSongsB15.map(s => s.rating)) : 0;
  const minOldRating = oldSongsB35.length > 0 ? Math.min(...oldSongsB35.map(s => s.rating)) : 0;

  const recommendations: RecommendationData[] = [];

  const newSongsB15Tuple = newSongsB15.map(song => ({song, isNew: true}));
  const oldSongsB35Tuple = oldSongsB35.map(song => ({song, isNew: false}));
  const newSongsRemainingTuple = newSongsRemaining.map(song => ({song, isNew: true}));
  const oldSongsRemainingTuple = oldSongsRemaining.map(song => ({song, isNew: false}));

  // Check each song for recommendation potential
  [...newSongsB15Tuple, ...oldSongsB35Tuple, ...newSongsRemainingTuple, ...oldSongsRemainingTuple].forEach(({song, isNew}) => {
    const isInB15 = isNew && newSongsB15.some(s => s.songId === song.songId && s.difficulty === song.difficulty);
    const isInB35 = !isNew && oldSongsB35.some(s => s.songId === song.songId && s.difficulty === song.difficulty);
    const isInBest = isInB15 || isInB35;

    const currentAccuracy = song.achievement / 10000;
    const minRequiredRating = isNew ? minNewRating : minOldRating;

    // Skip if song can't be improved
    if (version >= 12) {
      if (currentAccuracy >= 100.5 && (song.fc === "ap" || song.fc === "ap+")) return;
    } else {
      if (currentAccuracy >= 100.5) return;
    }

    // For songs outside best lists, check if 100.5% would be beneficial
    if (!isInBest) {
      const extra = version >= 12 ? 1 : 0;
      const maxPossibleRating = Math.floor(0.224 * 100.5 * song.levelPrecise / 10) + extra;
      if (maxPossibleRating <= minRequiredRating) return;
    }

    let order = 0;

    for (const accuracy of ACCURACY_VALUES) {
      if (accuracy <= currentAccuracy) continue;
      if (version < 12 && accuracy === 101.0) continue;

      const factor = getRatingFactor(accuracy);
      const extra = version >= 12 && accuracy === 101.0 ? 1 : 0;
      const newRating = Math.floor(factor * Math.min(accuracy, 100.5) * song.levelPrecise / 10) + extra;

      if (newRating <= minRequiredRating) continue;

      const ratingGain = isInBest
        ? newRating - song.rating  // Improving existing song in B15/B35
        : newRating - minRequiredRating;  // Replacing lowest song in B15/B35

      if (ratingGain <= 0) continue;

      const efficiency = accuracy === 101.0
        ? 2.0
        : ratingGain / Math.max(accuracy - currentAccuracy, 0.1);

      recommendations.push({
        song,
        currentAccuracy,
        targetAccuracy: accuracy,
        accuracyDiff: accuracy - currentAccuracy,
        currentRating: song.rating,
        targetRating: newRating,
        ratingGain,
        isInBest,
        category: isNew ? "new" : "old",
        efficiency: efficiency,
        order,
      });

      order++;
    }
  });

  // Sort by weighting: prioritize small accuracy diff and high rating gain
  return recommendations.sort((a, b) => {
    if (a.order !== b.order) {
      return a.order - b.order;
    }

    // Weighted score: prioritize efficiency (rating gain per accuracy diff)
    if (Math.abs(a.efficiency - b.efficiency) < 0.1) {
      // If efficiency is similar, prefer higher rating gain
      return b.ratingGain - a.ratingGain;
    }
    
    return b.efficiency - a.efficiency;
  });
}

interface FilterPanelProps {
  filters: FilterType[];
  onAddFilter: (filter: FilterType) => void;
  onRemoveFilter: (filter: FilterType) => void;
  availableLevels: string[];
  availableTargets: string[];
  allRecommendations: RecommendationData[];
}

function FilterPanel({ filters, onAddFilter, onRemoveFilter, availableLevels, availableTargets, allRecommendations }: FilterPanelProps) {
  const t = useTranslations();
  
  const wouldYieldResults = (testFilter: FilterType): boolean => {
    // First check if the filter alone yields any results (remove useless filters)
    const aloneResults = applyFilters(allRecommendations, [testFilter]).length > 0;
    if (!aloneResults) return false;
    
    // Then check if it yields results with existing filters
    const testFilters = [...filters, testFilter];
    return applyFilters(allRecommendations, testFilters).length > 0;
  };

  const getAvailableOptions = (category: string) => {
    const activeFilters = filters.filter(f => f.type === category).map(f => f.value);
    
    let options: Array<{ value: string; label: string }> = [];
    
    switch (category) {
      case "difficulty":
        const difficultyMap = {
          basic: "Easy",
          advanced: "Advanced",
          expert: "Expert",
          master: "Master",
          remaster: "Re:Master"
        };
        options = DIFFICULTY_OPTIONS.filter(opt => !activeFilters.includes(opt)).map(opt => ({
          value: opt,
          label: difficultyMap[opt as keyof typeof difficultyMap]
        }));
        break;
      case "level":
        options = availableLevels.filter(opt => !activeFilters.includes(opt)).map(opt => ({
          value: opt,
          label: `Lv ${opt}`
        }));
        break;
      case "type":
        options = TYPE_OPTIONS.filter(opt => !activeFilters.includes(opt)).map(opt => ({
          value: opt,
          label: opt.toUpperCase()
        }));
        break;
      case "target":
        options = availableTargets.filter(opt => !activeFilters.includes(opt)).map(opt => ({
          value: opt,
          label: opt
        }));
        break;
      case "achievement":
        options = ACHIEVEMENT_OPTIONS.filter(opt => !activeFilters.includes(opt.value)).map(opt => ({
          value: opt.value,
          label: opt.label
        }));
        break;
      case "version":
        options = VERSION_OPTIONS.filter(opt => !activeFilters.includes(opt.value)).map(opt => ({
          value: opt.value,
          label: opt.value === "new" ? t('recommendations.filters.new') : t('recommendations.filters.old')
        }));
        break;
      default:
        return [];
    }

    // Filter to only show options that would yield results
    return options.filter(opt => 
      wouldYieldResults({ type: category, value: opt.value } as FilterType)
    );
  };

  const handleSelectValue = (category: string, value: string) => {
    const filter: FilterType = { type: category, value: value } as FilterType;
    onAddFilter(filter);
  };

  const categories = [
    { value: "difficulty", label: t('recommendations.filterCategories.difficulty'), icon: Layers },
    { value: "level", label: t('recommendations.filterCategories.level'), icon: Hash },
    { value: "type", label: t('recommendations.filterCategories.type'), icon: Disc3 },
    { value: "target", label: t('recommendations.filterCategories.targetRating'), icon: Target },
    { value: "achievement", label: t('recommendations.filterCategories.achievement'), icon: Award },
    { value: "version", label: t('recommendations.filterCategories.version'), icon: Calendar }
  ];

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ 
        height: { 
          duration: 0.3,
          ease: [0.4, 0, 0.2, 1] // cubic-bezier easing
        },
        opacity: { 
          duration: 0.25,
          ease: "easeInOut"
        }
      }}
    >
      <motion.div
        className="pt-4 space-y-3"
        initial={{ y: -10 }}
        animate={{ y: 0 }}
        transition={{ 
          duration: 0.3,
          ease: [0.4, 0, 0.2, 1]
        }}
      >
        {/* Horizontal layout for filters and add buttons */}
        <div className="flex flex-wrap gap-2 items-center">
          {/* Active Filters */}
          <AnimatePresence mode="popLayout">
            {filters.map((filter, index) => (
              <motion.div
                key={getFilterKey(filter)}
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: "auto", opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ 
                  duration: 0.2,
                  ease: [0.4, 0, 0.2, 1],
                  delay: index * 0.03
                }}
                layout
              >
                <Button
                  variant="default"
                  size="sm"
                  className="gap-2 whitespace-nowrap"
                  onClick={() => onRemoveFilter(filter)}
                >
                  {getFilterLabel(filter, t)}
                  <X className="h-3 w-3" />
                </Button>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Add Filter Buttons */}
          <AnimatePresence mode="popLayout">
            {categories.map((category, index) => {
              const options = getAvailableOptions(category.value);
              if (options.length === 0) return null;

              const Icon = category.icon;

              return (
                <motion.div
                  key={category.value}
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: "auto", opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={{ 
                    duration: 0.25,
                    ease: [0.4, 0, 0.2, 1],
                    delay: 0.1 + (index * 0.05)
                  }}
                  layout
                >
                  <Select
                    value=""
                    onValueChange={(value) => handleSelectValue(category.value, value)}
                  >
                    <SelectTrigger className="w-auto h-8 min-w-[100px] whitespace-nowrap gap-1">
                      <Icon className="h-4 w-4" />
                      <SelectValue placeholder={category.label} />
                    </SelectTrigger>
                    <SelectContent>
                      {options.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}

function RecommendationRow({ recommendation }: { recommendation: RecommendationData }) {
  const { song, currentAccuracy, targetAccuracy, currentRating, targetRating, accuracyDiff, ratingGain, isInBest, category } = recommendation;

  return (
    <div className="flex xs:justify-between xs:items-center text-sm h-16 max-xs:h-30 max-xs:flex-col max-xs:justify-start max-xs:gap-y-2">
      <div className="flex items-center xs:flex-1 min-w-0 h-12 max-xs:mt-1.5">
        <Image
          src={createSafeMaimaiImageUrl(song.cover)}
          alt={song.songName}
          className={cn(
            "w-8 h-8 ml-1 mr-3 rounded ring-2 ring-offset-2 ring-offset-card",
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
          quality={1}
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <div className="truncate font-medium">{song.songName}</div>
            <div className={cn(
              "px-1.5 py-0.5 rounded text-xs font-medium whitespace-nowrap",
              category === "new" ? "bg-lime-100 text-lime-800" : "bg-orange-100 text-orange-800"
            )}>
              {category === "new" ? "New" : "Old"}
            </div>
            {category === "new" && isInBest && (
              <div className="px-1.5 py-0.5 rounded text-xs font-medium whitespace-nowrap bg-green-100 text-green-800">
                B15
              </div>
            )}
            {category === "old" && isInBest && (
              <div className="px-1.5 py-0.5 rounded text-xs font-medium whitespace-nowrap bg-red-100 text-red-800">
                B35
              </div>
            )}
          </div>
          <div className="text-muted-foreground text-xs truncate">
            {song.type.toUpperCase()} • {song.difficulty.slice(0, 3).toUpperCase()} {(song.levelPrecise / 10).toFixed(1)} • {song.artist}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="xs:text-right xs:ml-2">
          <div className="text-xs text-muted-foreground">Current → Target</div>
          <div className="font-mono text-xs">
            {currentAccuracy.toFixed(2)}% → {targetAccuracy === 101.0 ? (
              <span className="text-green-600">AP</span>
            ) : (
              <span className="text-green-600">{targetAccuracy.toFixed(2)}%</span>
            )}
          </div>
          <div className="font-mono text-xs">
            {currentRating} → <span className="text-green-600">{targetRating}</span>
          </div>
        </div>

        <div className="text-right ml-4 mr-2 space-y-0.5 w-16">
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <Target className="h-3 w-3 text-amber-500" />
            {targetAccuracy === 101.0 ? (
              <span className="text-orange-400 font-semibold">AP</span>
            ) : (
              <span>+{accuracyDiff.toFixed(2)}%</span>
            )}
          </div>
          <div className="text-xs flex items-center gap-1">
            <Zap className="h-3 w-3 text-green-500" />
            <span className="font-mono font-semibold">+{ratingGain}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function RecommendationCard({ selectedSnapshotData, flags }: { selectedSnapshotData: SnapshotWithSongs, flags: Flags }) {
  const t = useTranslations();
  const [filterCategory, setFilterCategory] = useState<"all" | "new" | "old" | "best">(
    flags.recommendationFilters ? "all" : "all"
  );
  const [advancedFilters, setAdvancedFilters] = useState<FilterType[]>([]);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const hasMountedRef = useRef(false);

  useEffect(() => {
    hasMountedRef.current = true;
  }, []);

  const { songs, snapshot } = selectedSnapshotData;
  const songsWithRating: SongWithRating[] = addRatingsAndSort(songs, snapshot.gameVersion);
  
  const recommendations = generateRecommendations(songsWithRating, snapshot.gameVersion);
  
  // Generate available options for filters
  const availableLevels = generateLevelOptions(songsWithRating);
  const availableTargets = generateTargetOptions(recommendations);

  const handleAddFilter = (filter: FilterType) => {
    setAdvancedFilters(prev => [...prev, filter]);
  };

  const handleRemoveFilter = (filter: FilterType) => {
    setAdvancedFilters(prev => prev.filter(f => getFilterKey(f) !== getFilterKey(filter)));
  };
  
  // Filter recommendations based on selected category or advanced filters
  let filteredRecommendations = recommendations;
  
  if (flags.recommendationFilters) {
    // Use advanced filters
    filteredRecommendations = applyFilters(recommendations, advancedFilters);
  } else {
    // Use old category filter
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
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Heart className="h-5 w-5 text-pink-500" />
            {t('dataContent.tabs.recommendations')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Heart className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-medium mb-2">{t('recommendations.noRecommendations')}</h3>
            <p className="text-muted-foreground">
              {t('recommendations.allOptimal')}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Heart className="h-5 w-5 text-pink-500" />
            {t('dataContent.tabs.recommendations')} ({filteredRecommendations.length})
          </CardTitle>
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
                availableLevels={availableLevels}
                availableTargets={availableTargets}
                allRecommendations={recommendations}
              />
            )}
          </AnimatePresence>
        )}
      </CardHeader>
      <CardContent>
        <div className="divide-y divide-dashed divide-gray-200">
          <AnimatePresence mode="popLayout">
            {filteredRecommendations.map((rec) => (
              <motion.div
                key={`${rec.song.songId}-${rec.song.difficulty}`}
                initial={hasMountedRef.current ? { opacity: 0, height: 0 } : false}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{
                  duration: 0.2,
                  ease: [0.4, 0, 0.2, 1],
                }}
                layout
                className="overflow-hidden"
              >
                <RecommendationRow recommendation={rec} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </CardContent>
    </Card>
  );
} 