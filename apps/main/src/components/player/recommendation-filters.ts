import type { LucideIcon } from "lucide-react";
import type { FilterCategory, GenericFilter } from "@/components/filter-panel";
import type { CanonicalGameId } from "@/lib/games/types";
import { codeOf } from "@/lib/games/codes";
import { getGame } from "@/lib/games/registry";
import { formatGameRating, getGameDifficulty, getGameScoreGrade } from "@/lib/games/presentation";

interface FilterableRecommendation {
  song: {
    difficulty: string;
    levelPrecise: number;
    level: string;
    type: string;
  };
  targetRating: number;
  targetScore: number;
  category: "new" | "old";
}

function generateTargetOptions(recommendations: FilterableRecommendation[], width: number): string[] {
  const targets = new Set<number>();
  recommendations.forEach(rec => {
    const rangeStart = Math.floor(rec.targetRating / width) * width;
    targets.add(rangeStart);
  });
  return Array.from(targets).sort((a, b) => a - b).map(t => `${t} - ${t + width - 1}`);
}

function difficultyLabel(game: CanonicalGameId, difficulty: string): string {
  return getGameDifficulty(game, codeOf(game, "difficulty", difficulty)).label;
}

function generateRecommendationLevelOptions(recommendations: FilterableRecommendation[]): string[] {
  const levels = new Set<string>();
  recommendations.forEach(rec => {
    levels.add(rec.song.level);
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
  },
  game: CanonicalGameId
): FilterCategory[] {
  const availableLevels = generateRecommendationLevelOptions(recommendations);
  const availableTargets = generateTargetOptions(recommendations, getGame(game).presentation.ratingRules.filterBucketWidth);

  return [
    {
      type: "difficulty",
      label: translations.difficulty,
      icon: icons.difficulty,
      options: [...new Set(recommendations.map(rec => rec.song.difficulty))].map(opt => ({ value: opt, label: difficultyLabel(game, opt) }))
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
      options: [...new Set(recommendations.map(rec => rec.song.type))].map(opt => ({ value: opt, label: opt.toUpperCase() }))
    },
    {
      type: "target",
      label: translations.targetRating,
      icon: icons.target,
      options: availableTargets.map(opt => ({ value: opt, label: opt.split(' - ').map(value => formatGameRating(game, Number(value))).join(' - ') }))
    },
    {
      type: "achievement",
      label: translations.achievement,
      icon: icons.achievement,
      options: [...new Set(recommendations.map(rec => rec.targetScore))].sort((a, b) => a - b).map(value => ({ value: String(value), label: game === "maimai" && value === 1010000 ? "AP" : getGameScoreGrade(game, value, 0, 0) }))
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
  translations: { new: string; old: string },
  game: CanonicalGameId
): string {
  switch (filter.type) {
    case "difficulty":
      return difficultyLabel(game, filter.value);
    case "level":
      return `Lv ${filter.value}`;
    case "type":
      return filter.value.toUpperCase();
    case "target":
      return filter.value.split(" - ").map(value => formatGameRating(game, Number(value))).join(" - ");
    case "achievement": {
      return game === "maimai" && Number(filter.value) === 1010000 ? "AP" : getGameScoreGrade(game, Number(filter.value), 0, 0);
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
    return Object.values(filtersByCategory).every(categoryFilters => {
      return categoryFilters.some(filter => {
        switch (filter.type) {
          case "difficulty":
            return rec.song.difficulty === filter.value;
          case "level": {
            return rec.song.level === filter.value;
          }
          case "type":
            return rec.song.type === filter.value;
          case "target": {
            const [min, max] = filter.value.split(' - ').map(Number);
            return rec.targetRating >= min && rec.targetRating <= max;
          }
          case "achievement":
            return rec.targetScore === Number(filter.value);
          case "version":
            return rec.category === filter.value;
          default:
            return true;
        }
      });
    });
  });
}
