import { RANKING_BUCKETS, keyOf } from "./codes";
import { getGame } from "./registry";
import {
  SCORE_STATUS_KINDS,
  type CanonicalGameId,
  type ChartTypePresentation,
  type DifficultyPresentation,
  type GamePresentation,
  type ScoreStatusKind,
  type StatusStyle,
} from "./types";

const missingValue = "—";

function presentationOf(game: CanonicalGameId): GamePresentation {
  return getGame(game).presentation;
}

function unknownDifficulty(code: number): DifficultyPresentation {
  const muted = "bg-muted text-muted-foreground";
  return {
    label: `#${code}`,
    shortLabel: `#${code}`,
    hex: "#71717a",
    cssVar: "var(--color-zinc-500)",
    classes: { text: "text-muted-foreground", cell: `${muted} border-border`, solidBg: "bg-zinc-500", chip: muted, border: "border-border", ring: "ring-border", badge: muted, cardBadge: muted },
  };
}

export function formatGameScore(game: CanonicalGameId, value: number | null | undefined, { precision = "full" }: { precision?: "full" | "compact" } = {}): string {
  if (value == null || !Number.isFinite(value)) return missingValue;
  return presentationOf(game).formatScore(value, precision);
}

export function formatGameScoreDelta(game: CanonicalGameId, from: number, to: number): string {
  return presentationOf(game).formatScoreDelta(from, to);
}

const groupedInteger = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** `average` keeps hundredths of an unscaled rating. `grouped` separates the thousands of an integer rating. */
export function formatGameRating(game: CanonicalGameId, value: number | null | undefined, { average = false, grouped = false } = {}): string {
  if (value == null || !Number.isFinite(value)) return missingValue;
  const { scale } = presentationOf(game).ratingRules;
  if (scale !== 1 || average) return (value / scale).toFixed(2);
  const rating = Math.floor(value);
  return grouped ? groupedInteger.format(rating) : String(rating);
}

/** Marks a level, or a rating derived from it, whose chart constant is estimated. */
export function formatEstimated(text: string, estimated: boolean | undefined): string {
  return estimated ? `≈${text}` : text;
}

export function formatGameLevel(game: CanonicalGameId, levelPrecise: number, difficultyCode: number): string {
  if (!Number.isFinite(levelPrecise)) return missingValue;
  return getGameDifficulty(game, difficultyCode).unknownDecimal
    ? `${Math.floor(levelPrecise / 10)}.?`
    : (levelPrecise / 10).toFixed(1);
}

export function getGameDifficulty(game: CanonicalGameId, code: number): DifficultyPresentation {
  const difficulties: Partial<Record<string, DifficultyPresentation>> = presentationOf(game).difficulties;
  return difficulties[keyOf(game, "difficulty", code)] ?? unknownDifficulty(code);
}

export function getGameChartType(game: CanonicalGameId, code: number): ChartTypePresentation {
  const chartTypes: Partial<Record<string, ChartTypePresentation>> = presentationOf(game).chartTypes;
  return chartTypes[keyOf(game, "chartType", code)]
    ?? { label: `#${code}`, hex: "#71717a", classes: { ring: "ring-border", chip: "bg-muted text-muted-foreground" } };
}

/** A chart's readable name, such as "Song DX MASTER". A game's implicit chart type is left out. */
export function formatChartLabel(game: CanonicalGameId, chart: { songName: string; chartType: number; difficulty: number }): string {
  const chartType = getGameChartType(game, chart.chartType);
  return [chart.songName, ...(chartType.implicit ? [] : [chartType.label]), getGameDifficulty(game, chart.difficulty).label].join(" ");
}

export function getGameStatusBadges(game: CanonicalGameId, status: Partial<Record<ScoreStatusKind, number | null>>): StatusStyle[] {
  const { statusStyles } = presentationOf(game);
  return SCORE_STATUS_KINDS.flatMap(kind => {
    const code = status[kind];
    if (code == null) return [];
    const styles: Partial<Record<string, StatusStyle | null>> = statusStyles[kind];
    const style = styles[keyOf(game, kind, code)];
    if (style === null) return [];
    return [style ?? { label: `${kind} #${code}`, className: "bg-zinc-500" }];
  });
}

export function getGameStatusLabels(game: CanonicalGameId, status: Partial<Record<ScoreStatusKind, number | null>>): string[] {
  return getGameStatusBadges(game, status).map(badge => badge.label);
}

export function getGameRankingBuckets(game: CanonicalGameId) {
  const sizes = getGame(game).rating.bucketSizes;
  return RANKING_BUCKETS.map(bucket => ({ ...bucket, size: sizes[bucket.key] }));
}

export function getGrade(game: CanonicalGameId, scoreValue: number): string {
  const { grades } = presentationOf(game);
  return (grades.find(grade => scoreValue >= grade.min) ?? grades[grades.length - 1]).label;
}

/** A score that earns a rating bonus shows as the top grade with the bonus, such as "SSS+ AP". */
export function getGameScoreGrade(game: CanonicalGameId, scoreValue: number, version: number, comboStatus: number): string {
  const bonus = getGame(game).rating.bonuses(version).find(bonus => bonus.comboStatuses.includes(comboStatus));
  return bonus ? `${presentationOf(game).grades[0].label} ${bonus.label}` : getGrade(game, scoreValue);
}

export function getGameScoreBenchmarks(game: CanonicalGameId): readonly { scoreValue: number; label: string }[] {
  return presentationOf(game).grades.filter(grade => grade.benchmark).map(grade => ({ scoreValue: grade.min, label: grade.label }));
}
