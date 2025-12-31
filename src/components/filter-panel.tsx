"use client";

import { memo } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select-friendly";
import { X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Generic filter type - value is always string for simplicity
export interface GenericFilter {
  type: string;
  value: string;
}

// Filter category configuration
export interface FilterCategory {
  type: string;
  label: string;
  icon: LucideIcon;
  options: Array<{ value: string; label: string }>;
  limit_one?: boolean;
}

// Props for getting label for a filter (custom per use-case)
export type GetFilterLabelFn = (filter: GenericFilter) => string;

// Props for applying filters to data (custom per use-case)
export type ApplyFiltersFn<T> = (filters: GenericFilter[]) => T[];

export function getFilterKey(filter: GenericFilter): string {
  return `${filter.type}-${filter.value}`;
}

interface FilterPanelProps<T> {
  filters: GenericFilter[];
  onAddFilter: (filter: GenericFilter) => void;
  onRemoveFilter: (filter: GenericFilter) => void;
  categories: FilterCategory[];
  applyFilters: ApplyFiltersFn<T>;
  getFilterLabel: GetFilterLabelFn;
  className?: string;
  triggerClassName?: string;
}

function FilterPanelInner<T>({
  filters,
  onAddFilter,
  onRemoveFilter,
  categories,
  applyFilters,
  getFilterLabel,
  className,
  triggerClassName,
}: FilterPanelProps<T>) {
  const wouldYieldResults = (testFilter: GenericFilter): boolean => {
    // First check if the filter alone yields any results (remove useless filters)
    const aloneResults = applyFilters([testFilter]).length > 0;
    if (!aloneResults) return false;

    // Then check if it yields results with existing filters
    const testFilters = [...filters, testFilter];
    return applyFilters(testFilters).length > 0;
  };

  const getAvailableOptions = (category: FilterCategory) => {
    const activeFilters = filters.filter(f => f.type === category.type).map(f => f.value);

    // Get options not already selected
    const availableOptions = category.options.filter(opt => !activeFilters.includes(opt.value));

    // Filter to only show options that would yield results
    return availableOptions.filter(opt =>
      wouldYieldResults({ type: category.type, value: opt.value })
    );
  };

  const handleSelectValue = (categoryType: string, value: string) => {
    onAddFilter({ type: categoryType, value });
  };

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{
        height: { duration: 0.3, ease: [0.4, 0, 0.2, 1] },
        opacity: { duration: 0.25, ease: "easeInOut" }
      }}
    >
      <motion.div
        className={cn("space-y-3", className)}
        initial={{ y: -10 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      >
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
                  {getFilterLabel(filter)}
                  <X className="h-3 w-3" />
                </Button>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Add Filter Dropdowns */}
          <AnimatePresence mode="popLayout">
            {categories.map((category, index) => {
              const options = getAvailableOptions(category);
              if (options.length === 0) return null;

              const Icon = category.icon;

              return (
                <motion.div
                  key={category.type}
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
                    onValueChange={(value) => handleSelectValue(category.type, value)}
                  >
                    <SelectTrigger className={cn("w-auto h-8 min-w-[100px] whitespace-nowrap gap-1", triggerClassName)}>
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

export const FilterPanel = memo(FilterPanelInner) as typeof FilterPanelInner;

// ============================================
// Song-specific filter utilities
// ============================================

export interface FilterableSong {
  difficulty: string;
  levelPrecise: number;
  type: "std" | "dx";
  addedVersion: number;
}

export type SongFilterType =
  | { type: "difficulty"; value: string }
  | { type: "level"; value: string }
  | { type: "chartType"; value: string }
  | { type: "version"; value: string };

const DIFFICULTY_OPTIONS = ["basic", "advanced", "expert", "master", "remaster"] as const;
const CHART_TYPE_OPTIONS = ["std", "dx"] as const;

export function generateLevelOptions<T extends FilterableSong>(songs: T[]): string[] {
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

export function createSongFilterCategories(
  songs: FilterableSong[],
  translations: { difficulty: string; level: string; chartType: string; version: string; new: string; old: string },
  showVersionFilter: boolean,
  icons: { difficulty: LucideIcon; level: LucideIcon; chartType: LucideIcon; version: LucideIcon }
): FilterCategory[] {
  const difficultyMap: Record<string, string> = {
    basic: "Easy",
    advanced: "Advanced",
    expert: "Expert",
    master: "Master",
    remaster: "Re:Master"
  };

  const availableLevels = generateLevelOptions(songs);

  const categories: FilterCategory[] = [
    {
      type: "difficulty",
      label: translations.difficulty,
      icon: icons.difficulty,
      options: DIFFICULTY_OPTIONS.map(opt => ({ value: opt, label: difficultyMap[opt] }))
    },
    {
      type: "level",
      label: translations.level,
      icon: icons.level,
      options: availableLevels.map(opt => ({ value: opt, label: `Lv ${opt}` }))
    },
    {
      type: "chartType",
      label: translations.chartType,
      icon: icons.chartType,
      options: CHART_TYPE_OPTIONS.map(opt => ({ value: opt, label: opt.toUpperCase() }))
    },
  ];

  if (showVersionFilter) {
    categories.push({
      type: "version",
      label: translations.version,
      icon: icons.version,
      options: [
        { value: "new", label: translations.new },
        { value: "old", label: translations.old }
      ]
    });
  }

  return categories;
}

export function createSongFilterLabel(
  filter: GenericFilter,
  translations: { new: string; old: string }
): string {
  const difficultyMap: Record<string, string> = {
    basic: "Easy",
    advanced: "Advanced",
    expert: "Expert",
    master: "Master",
    remaster: "Re:Master"
  };

  switch (filter.type) {
    case "difficulty":
      return difficultyMap[filter.value] || filter.value;
    case "level":
      return `Lv ${filter.value}`;
    case "chartType":
      return filter.value.toUpperCase();
    case "version":
      return filter.value === "new" ? translations.new : translations.old;
    default:
      return filter.value;
  }
}

export function applySongFilters<T extends FilterableSong>(
  songs: T[],
  filters: GenericFilter[],
  gameVersion: number
): T[] {
  if (filters.length === 0) return songs;

  const filtersByCategory = filters.reduce((acc, filter) => {
    if (!acc[filter.type]) acc[filter.type] = [];
    acc[filter.type].push(filter);
    return acc;
  }, {} as Record<string, GenericFilter[]>);

  const versionAboveIsNew = gameVersion >= 12 ? gameVersion - 1 : gameVersion;

  return songs.filter(song => {
    return Object.entries(filtersByCategory).every(([category, categoryFilters]) => {
      return categoryFilters.some(filter => {
        switch (filter.type) {
          case "difficulty":
            return song.difficulty === filter.value;
          case "level": {
            const level = song.levelPrecise / 10;
            const isPlus = level % 1 >= 0.6;
            const baseLevel = Math.floor(level);
            const levelStr = isPlus ? `${baseLevel}+` : `${baseLevel}`;
            return levelStr === filter.value;
          }
          case "chartType":
            return song.type === filter.value;
          case "version": {
            const isNew = song.addedVersion >= versionAboveIsNew;
            return filter.value === "new" ? isNew : !isNew;
          }
          default:
            return true;
        }
      });
    });
  });
}

// ============================================
// Recommendation-specific filter utilities
// ============================================

export interface FilterableRecommendation {
  song: {
    difficulty: string;
    levelPrecise: number;
    type: "std" | "dx";
  };
  targetRating: number;
  targetAccuracy: number;
  category: "new" | "old";
}

const ACHIEVEMENT_OPTIONS = [
  { value: "97.0", label: "S" },
  { value: "98.0", label: "S+" },
  { value: "99.0", label: "SS" },
  { value: "99.5", label: "SS+" },
  { value: "100.0", label: "SSS" },
  { value: "100.5", label: "SSS+" },
  { value: "101.0", label: "AP" }
] as const;

export function generateTargetOptions(recommendations: FilterableRecommendation[]): string[] {
  const targets = new Set<number>();
  recommendations.forEach(rec => {
    const rangeStart = Math.floor(rec.targetRating / 10) * 10;
    targets.add(rangeStart);
  });
  return Array.from(targets).sort((a, b) => a - b).map(t => `${t} - ${t + 9}`);
}

export function generateRecommendationLevelOptions(recommendations: FilterableRecommendation[]): string[] {
  const levels = new Set<string>();
  recommendations.forEach(rec => {
    const level = rec.song.levelPrecise / 10;
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

export function createRecommendationFilterCategories(
  recommendations: FilterableRecommendation[],
  translations: {
    difficulty: string;
    level: string;
    type: string;
    targetRating: string;
    achievement: string;
    version: string;
    new: string;
    old: string;
  },
  icons: {
    difficulty: LucideIcon;
    level: LucideIcon;
    type: LucideIcon;
    target: LucideIcon;
    achievement: LucideIcon;
    version: LucideIcon;
  }
): FilterCategory[] {
  const difficultyMap: Record<string, string> = {
    basic: "Easy",
    advanced: "Advanced",
    expert: "Expert",
    master: "Master",
    remaster: "Re:Master"
  };

  const availableLevels = generateRecommendationLevelOptions(recommendations);
  const availableTargets = generateTargetOptions(recommendations);

  return [
    {
      type: "difficulty",
      label: translations.difficulty,
      icon: icons.difficulty,
      options: DIFFICULTY_OPTIONS.map(opt => ({ value: opt, label: difficultyMap[opt] }))
    },
    {
      type: "level",
      label: translations.level,
      icon: icons.level,
      options: availableLevels.map(opt => ({ value: opt, label: `Lv ${opt}` }))
    },
    {
      type: "type",
      label: translations.type,
      icon: icons.type,
      options: CHART_TYPE_OPTIONS.map(opt => ({ value: opt, label: opt.toUpperCase() }))
    },
    {
      type: "target",
      label: translations.targetRating,
      icon: icons.target,
      options: availableTargets.map(opt => ({ value: opt, label: opt }))
    },
    {
      type: "achievement",
      label: translations.achievement,
      icon: icons.achievement,
      options: ACHIEVEMENT_OPTIONS.map(opt => ({ value: opt.value, label: opt.label }))
    },
    {
      type: "version",
      label: translations.version,
      icon: icons.version,
      options: [
        { value: "new", label: translations.new },
        { value: "old", label: translations.old }
      ]
    }
  ];
}

export function createRecommendationFilterLabel(
  filter: GenericFilter,
  translations: { new: string; old: string }
): string {
  const difficultyMap: Record<string, string> = {
    basic: "Easy",
    advanced: "Advanced",
    expert: "Expert",
    master: "Master",
    remaster: "Re:Master"
  };

  switch (filter.type) {
    case "difficulty":
      return difficultyMap[filter.value] || filter.value;
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
      return filter.value === "new" ? translations.new : translations.old;
    default:
      return filter.value;
  }
}

export function applyRecommendationFilters<T extends FilterableRecommendation>(
  recommendations: T[],
  filters: GenericFilter[]
): T[] {
  if (filters.length === 0) return recommendations;

  const filtersByCategory = filters.reduce((acc, filter) => {
    if (!acc[filter.type]) acc[filter.type] = [];
    acc[filter.type].push(filter);
    return acc;
  }, {} as Record<string, GenericFilter[]>);

  return recommendations.filter(rec => {
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
          default:
            return true;
        }
      });
    });
  });
}
