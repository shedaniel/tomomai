import type { LucideIcon } from "lucide-react";
import type { FilterCategory, GenericFilter } from "@/components/filter-panel";
import { formatGameRating, getGameChartType, getGameDifficulty } from "@/lib/games/presentation";
import type { RecommendationData } from "@/lib/games/recommendations";
import { getGame } from "@/lib/games/registry";
import type { CanonicalGameId } from "@/lib/games/types";

type VersionLabels = { new: string; old: string };

// A game's codes are in its display order.
function codeOptions(codes: number[]): string[] {
  return [...new Set(codes)].sort((a, b) => a - b).map(String);
}

function levelOptions(recommendations: RecommendationData[]): string[] {
  return [...new Set(recommendations.map(rec => rec.song.level))].sort((a, b) =>
    parseFloat(a.replace("+", ".5")) - parseFloat(b.replace("+", ".5")));
}

function targetRatingOptions(recommendations: RecommendationData[], width: number): string[] {
  const starts = new Set(recommendations.map(rec => Math.floor(rec.targetRating / width) * width));
  return [...starts].sort((a, b) => a - b).map(start => `${start} - ${start + width - 1}`);
}

function targetOptions(recommendations: RecommendationData[]): string[] {
  const targets = new Map(recommendations.map(rec => [rec.target.label, rec.target]));
  return [...targets.values()]
    .sort((a, b) => a.scoreValue - b.scoreValue || a.comboStatus - b.comboStatus)
    .map(target => target.label);
}

export function createRecommendationFilterLabel(filter: GenericFilter, translations: VersionLabels, game: CanonicalGameId): string {
  switch (filter.type) {
    case "difficulty":
      return getGameDifficulty(game, Number(filter.value)).label;
    case "level":
      return `Lv ${filter.value}`;
    case "type":
      return getGameChartType(game, Number(filter.value)).label;
    case "target":
      return filter.value.split(" - ").map(value => formatGameRating(game, Number(value))).join(" - ");
    case "version":
      return filter.value === "new" ? translations.new : translations.old;
    default:
      return filter.value;
  }
}

/** Categories that would offer a single option are left out, since that option matches every recommendation. */
export function createRecommendationFilterCategories(
  recommendations: RecommendationData[],
  translations: VersionLabels & {
    difficulty: string;
    level: string;
    type: string;
    targetRating: string;
    achievement: string;
    version: string;
  },
  icons: {
    difficulty: LucideIcon;
    level: LucideIcon;
    type: LucideIcon;
    target: LucideIcon;
    achievement: LucideIcon;
    version: LucideIcon;
  },
  game: CanonicalGameId
): FilterCategory[] {
  const category = (type: string, label: string, icon: LucideIcon, values: string[]): FilterCategory => ({
    type,
    label,
    icon,
    options: values.map(value => ({ value, label: createRecommendationFilterLabel({ type, value }, translations, game) })),
  });
  const versions = (["new", "old"] as const).filter(version => recommendations.some(rec => rec.category === version));

  return [
    category("difficulty", translations.difficulty, icons.difficulty, codeOptions(recommendations.map(rec => rec.song.difficultyCode))),
    category("level", translations.level, icons.level, levelOptions(recommendations)),
    category("type", translations.type, icons.type, codeOptions(recommendations.map(rec => rec.song.typeCode))),
    category("target", translations.targetRating, icons.target,
      targetRatingOptions(recommendations, getGame(game).presentation.ratingRules.filterBucketWidth)),
    category("achievement", translations.achievement, icons.achievement, targetOptions(recommendations)),
    category("version", translations.version, icons.version, versions),
  ].filter(({ options }) => options.length > 1);
}

export function applyRecommendationFilters(recommendations: RecommendationData[], filters: GenericFilter[]): RecommendationData[] {
  if (filters.length === 0) return recommendations;

  const filtersByCategory = filters.reduce((acc, filter) => {
    (acc[filter.type] ??= []).push(filter);
    return acc;
  }, {} as Record<string, GenericFilter[]>);

  return recommendations.filter(rec => Object.values(filtersByCategory).every(categoryFilters => categoryFilters.some(filter => {
    switch (filter.type) {
      case "difficulty":
        return String(rec.song.difficultyCode) === filter.value;
      case "level":
        return rec.song.level === filter.value;
      case "type":
        return String(rec.song.typeCode) === filter.value;
      case "target": {
        const [min, max] = filter.value.split(" - ").map(Number);
        return rec.targetRating >= min && rec.targetRating <= max;
      }
      case "achievement":
        return rec.target.label === filter.value;
      case "version":
        return rec.category === filter.value;
      default:
        return true;
    }
  })));
}
