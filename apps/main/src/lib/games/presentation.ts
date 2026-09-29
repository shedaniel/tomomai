import { ACHIEVEMENTS } from "@/lib/games/maimai/grades";
import { apBonusApplies } from "@/lib/games/maimai/rating";
import { GAME_CODES, RANKING_BUCKETS, getGrade, keyOf } from "./codes";
import { getGame } from "./registry";
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

export function getGameDifficultyLabel(game: CanonicalGameId, value: number | string): string {
  const code = getGameCode(game, "difficulty", value);
  const name = keyOf(game, "difficulty", code);
  if (name === "remaster") return "Re:MASTER";
  if (name === "worlds-end") return "WORLD'S END";
  return name?.toUpperCase() ?? `#${code}`;
}

export function getGameChartTypeLabel(game: CanonicalGameId, value: number | string): string {
  const code = getGameCode(game, "chartType", value);
  return keyOf(game, "chartType", code)?.toUpperCase() ?? `#${code}`;
}

export function getGameChartTypeBadgeLabel(game: CanonicalGameId, value: number | string): string | null {
  return GAME_CODES[game].chartType.length > 1 ? getGameChartTypeLabel(game, value) : null;
}

export function getGameStatusLabels(game: CanonicalGameId, status: {
  comboStatus?: number | null;
  syncStatus?: number | null;
  clearStatus?: number | null;
}): string[] {
  return (["comboStatus", "syncStatus", "clearStatus"] as const).flatMap(kind => {
    const code = status[kind];
    if (code == null || code === 0) return [];
    const label = keyOf(game, kind, code);
    if (kind === "clearStatus" && label === "clear") return [];
    return [label ? label.replaceAll("-", " ").toUpperCase() : `${kind} #${code}`];
  });
}

export function getGameRankingBuckets(game: CanonicalGameId) {
  const sizes = getGame(game).rating.bucketSizes;
  return RANKING_BUCKETS.map(bucket => ({ ...bucket, label: `B${sizes[bucket.key]}`, size: sizes[bucket.key] }));
}

const difficultyStyles = [
  { text: "text-green-700 dark:text-green-300", bg: "bg-green-100 dark:bg-green-950", ring: "ring-green-400 dark:ring-green-600", badge: "bg-green-500 dark:bg-green-600 text-white" },
  { text: "text-yellow-700 dark:text-yellow-300", bg: "bg-yellow-100 dark:bg-yellow-950", ring: "ring-yellow-400 dark:ring-yellow-600", badge: "bg-yellow-500 dark:bg-yellow-600 text-white" },
  { text: "text-red-700 dark:text-red-300", bg: "bg-red-100 dark:bg-red-950", ring: "ring-red-400 dark:ring-red-600", badge: "bg-red-500 dark:bg-red-600 text-white" },
  { text: "text-purple-700 dark:text-purple-300", bg: "bg-purple-100 dark:bg-purple-950", ring: "ring-purple-500 dark:ring-purple-600", badge: "bg-purple-500 dark:bg-purple-600 text-white" },
  { text: "text-purple-900 dark:text-purple-200", bg: "bg-purple-50 dark:bg-purple-950", ring: "ring-purple-200 dark:ring-purple-400", badge: "bg-purple-200 text-purple-900 dark:bg-purple-400 dark:text-purple-900" },
  { text: "text-pink-700 dark:text-pink-300", bg: "bg-pink-100 dark:bg-pink-950", ring: "ring-pink-400 dark:ring-pink-600", badge: "bg-pink-500 dark:bg-pink-600 text-white" },
];
export function getGameDifficultyColors(game: CanonicalGameId, value: number | string) {
  const code = getGameCode(game, "difficulty", value);
  if (game === "chunithm" && code === 4) return { text: "text-red-700 dark:text-red-300", bg: "bg-red-100 dark:bg-red-950", ring: "ring-red-700 dark:ring-red-500", badge: "bg-red-800 text-white dark:bg-red-700" };
  return difficultyStyles[code] ?? { text: "text-muted-foreground", bg: "bg-muted", ring: "ring-border", badge: "bg-muted text-muted-foreground" };
}

export function getGameDifficultyHex(game: CanonicalGameId, value: number | string): string {
  const key = getGameDifficultyKey(game, getGameCode(game, "difficulty", value));
  const colors: Record<string, string> = {
    basic: "#10b981", advanced: "#f59e0b", expert: "#f43f5e", master: "#8b5cf6",
    remaster: "#d8b4fe", utage: "#ec4899", ultima: "#b91c1c", "worlds-end": "#ec4899",
  };
  return colors[key] ?? "#71717a";
}

export function formatGameLevel(game: CanonicalGameId, levelPrecise: number, difficulty?: number | string): string {
  if (!Number.isFinite(levelPrecise)) return missingValue;
  if (game === "maimai" && getGameCode(game, "difficulty", difficulty ?? -1) === 5) return `${Math.floor(levelPrecise / 10)}.?`;
  return (levelPrecise / 10).toFixed(1);
}

export function getGameCode(game: CanonicalGameId, kind: "difficulty" | "chartType" | "comboStatus", value: number | string): number {
  if (typeof value === "number") return value;
  const keys: readonly string[] = GAME_CODES[game][kind];
  return keys.indexOf(value);
}

export function getGameChartTypeKey(game: CanonicalGameId, code: number): string {
  return keyOf(game, "chartType", code) ?? String(code);
}

export function getGameDifficultyKey(game: CanonicalGameId, code: number): string {
  return keyOf(game, "difficulty", code) ?? String(code);
}

export function getGameChartTypeBadge(game: CanonicalGameId, value: string): string | null {
  const assets: Partial<Record<CanonicalGameId, Record<string, string>>> = {
    maimai: { std: `${process.env.NEXT_PUBLIC_R2_URL}/covers/music_standard.webp`, dx: `${process.env.NEXT_PUBLIC_R2_URL}/covers/music_dx.webp` },
  };
  return assets[game]?.[value] ?? null;
}

export function getGameScoreLabelKey(game: CanonicalGameId): string {
  return { maimai: "db.songs.detail.achievement", chunithm: "db.songs.detail.score" }[game];
}

export function getGameScoreGrade(game: CanonicalGameId, scoreValue: number, version: number, comboStatus: number): string {
  if (game === "maimai" && apBonusApplies(version) && comboStatus >= 3) return "SSS+ AP";
  return getGrade(game, scoreValue);
}

export function getGameScoreBenchmarks(game: CanonicalGameId): readonly { scoreValue: number; label: string }[] {
  const benchmarks = {
    maimai: ACHIEVEMENTS.map(item => ({ scoreValue: item.achievement, label: item.rate })),
    chunithm: [1009000, 1007500, 1005000, 1000000, 990000, 975000, 950000, 925000, 900000].map(scoreValue => ({ scoreValue, label: getGrade("chunithm", scoreValue) })),
  };
  return benchmarks[game];
}

export function getGameRatingBonuses(game: CanonicalGameId, version: number): readonly { label: string; scoreValue: number; comboStatus: number }[] {
  return game === "maimai" && apBonusApplies(version) ? [{ label: "AP", scoreValue: 1005000, comboStatus: 3 }] : [];
}

export function getGameCatalogSections(game: CanonicalGameId): readonly string[] {
  return { maimai: ["songs", "stats", "events", "posts"], chunithm: ["songs"] }[game];
}
