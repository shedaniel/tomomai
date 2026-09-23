import { GAME_CODE_MAPS } from "./codes";
import type { CanonicalGameId } from "./types";

const missingValue = "—";
const integer = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function formatGameScore(game: CanonicalGameId, value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return missingValue;
  return game === "maimai" ? `${(value / 10_000).toFixed(4)}%` : integer.format(value);
}

export function formatGameRating(game: CanonicalGameId, value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return missingValue;
  return game === "maimai" ? String(Math.floor(value)) : (value / 100).toFixed(2);
}

export function getGameDifficultyLabel(game: CanonicalGameId, code: number): string {
  const name = GAME_CODE_MAPS[game].difficulty[code];
  if (name === "remaster") return "Re:MASTER";
  if (name === "worlds-end") return "WORLD'S END";
  return name?.toUpperCase() ?? `#${code}`;
}

export function getGameChartTypeLabel(game: CanonicalGameId, code: number): string {
  const name = GAME_CODE_MAPS[game].chartType[code];
  if (name === "standard") return game === "maimai" ? "STD" : "STANDARD";
  if (name === "worlds-end") return "WORLD'S END";
  return name?.toUpperCase() ?? `#${code}`;
}

export function getGameStatusLabels(game: CanonicalGameId, status: {
  comboStatus?: number | null;
  syncStatus?: number | null;
  clearStatus?: number | null;
}): string[] {
  return (["comboStatus", "syncStatus", "clearStatus"] as const).flatMap(kind => {
    const code = status[kind];
    if (code == null || code === 0) return [];
    const label = GAME_CODE_MAPS[game][kind][code];
    return [label ? label.replaceAll("-", " ").toUpperCase() : `${kind} #${code}`];
  });
}

export function getGameRankingBuckets(game: CanonicalGameId) {
  return [
    { code: 1, key: "new", label: game === "maimai" ? "B15" : "B20", size: game === "maimai" ? 15 : 20 },
    { code: 2, key: "old", label: game === "maimai" ? "B35" : "B30", size: game === "maimai" ? 35 : 30 },
  ] as const;
}

export function getGameDifficultyColors(game: CanonicalGameId, code: number): { text: string; bg: string; ring: string } {
  if (game === "chunithm" && code === 4) return { text: "text-red-700 dark:text-red-300", bg: "bg-red-100 dark:bg-red-950", ring: "ring-red-700" };
  const colors = [
    { text: "text-green-700 dark:text-green-300", bg: "bg-green-100 dark:bg-green-950", ring: "ring-green-400" },
    { text: "text-yellow-700 dark:text-yellow-300", bg: "bg-yellow-100 dark:bg-yellow-950", ring: "ring-yellow-400" },
    { text: "text-red-700 dark:text-red-300", bg: "bg-red-100 dark:bg-red-950", ring: "ring-red-400" },
    { text: "text-purple-700 dark:text-purple-300", bg: "bg-purple-100 dark:bg-purple-950", ring: "ring-purple-500" },
    { text: "text-purple-900 dark:text-purple-200", bg: "bg-purple-50 dark:bg-purple-950", ring: "ring-purple-200" },
    { text: "text-pink-700 dark:text-pink-300", bg: "bg-pink-100 dark:bg-pink-950", ring: "ring-pink-400" },
  ];
  return colors[code] ?? { text: "text-muted-foreground", bg: "bg-muted", ring: "ring-border" };
}

export function formatGameLevel(game: CanonicalGameId, levelPrecise: number, difficulty?: number): string {
  if (!Number.isFinite(levelPrecise)) return missingValue;
  if (game === "maimai" && difficulty === 5) return `${Math.floor(levelPrecise / 10)}?`;
  return (levelPrecise / 10).toFixed(1);
}
