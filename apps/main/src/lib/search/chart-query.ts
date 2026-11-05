import { GAME_CODES, codeOf } from "@/lib/games/codes";
import type { CanonicalGameId } from "@/lib/games/ids";
import { getGame } from "@/lib/games/registry";
import { SCORE_STATUS_KINDS, type ScoreStatusKind } from "@/lib/games/types";
import { difficultyNames } from "./song-search";

type LevelFilter = { level: string } | { min: number; max: number };

/** A query made only of chart filters, such as `14+ master !fc`, `<sss 13.5-13.9` or `random 13+`. */
export type ChartQuery = {
  /** Any of them matches. Bounds are in tenths of a level, as `levelPrecise` stores them. */
  levels: LevelFilter[];
  difficulties: number[];
  chartTypes: number[];
  minScore: number | null;
  /** Exclusive. */
  belowScore: number | null;
  /** `reached: false` keeps charts played without reaching the status. */
  statuses: { kind: ScoreStatusKind; code: number; reached: boolean }[];
  played: boolean | null;
  random: boolean;
};

export type ChartQueryChart = { level: string; levelPrecise: number; difficultyCode: number; typeCode: number };
export type ChartQueryScore = { scoreValue: number } & Partial<Record<ScoreStatusKind, number | null>>;

const RANDOM_WORDS = new Set(["random", "rand", "ランダム", "随机", "隨機", "랜덤"]);
const PLAYED_WORDS = new Set(["played", "プレイ済み"]);
const UNPLAYED_WORDS = new Set(["unplayed", "未プレイ", "未游玩", "未遊玩"]);

const DECIMAL = /^\d{1,2}\.\d$/;
const tenths = (text: string) => Math.round(Number(text) * 10);

function parseLevel(word: string): LevelFilter | null {
  if (/^\d{1,2}\+?$/.test(word)) return { level: word };
  if (DECIMAL.test(word)) return { min: tenths(word), max: tenths(word) };
  const range = /^(\d{1,2}(?:\.\d)?)-(\d{1,2}(?:\.\d)?)$/.exec(word);
  if (range) {
    const [min, max] = [tenths(range[1]), range[2].includes(".") ? tenths(range[2]) : tenths(range[2]) + 9];
    return min <= max ? { min, max } : null;
  }
  const compare = /^(>=|<=|>|<)(\d{1,2}(?:\.\d)?)$/.exec(word);
  if (!compare) return null;
  const value = tenths(compare[2]);
  const whole = !compare[2].includes(".");
  switch (compare[1]) {
    case ">=": return { min: value, max: Infinity };
    case ">": return { min: whole ? value + 10 : value + 1, max: Infinity };
    case "<=": return { min: 0, max: whole ? value + 9 : value };
    default: return { min: 0, max: value - 1 };
  }
}

function statusOf(game: CanonicalGameId, word: string): { kind: ScoreStatusKind; code: number } | null {
  const { statusStyles } = getGame(game).presentation;
  for (const kind of SCORE_STATUS_KINDS) {
    const styles: Partial<Record<string, { label: string } | null>> = statusStyles[kind];
    for (const [key, style] of Object.entries(styles)) {
      if (style && (key === word || style.label.toLowerCase() === word)) return { kind, code: codeOf(game, kind, key) };
    }
  }
  return null;
}

function gradeOf(game: CanonicalGameId, word: string): number | null {
  return getGame(game).presentation.grades.find(grade => grade.label.toLowerCase() === word)?.min ?? null;
}

function applyWord(game: CanonicalGameId, query: ChartQuery, word: string): boolean {
  if (RANDOM_WORDS.has(word)) return (query.random = true);
  if (PLAYED_WORDS.has(word)) return (query.played = true);
  if (UNPLAYED_WORDS.has(word)) {
    query.played = false;
    return true;
  }

  const level = parseLevel(word);
  if (level) {
    query.levels.push(level);
    return true;
  }

  const negated = /^[!<]/.test(word);
  const bare = word.replace(/^(>=|[!<])/, "");
  const status = statusOf(game, bare);
  if (status) {
    query.statuses.push({ ...status, reached: !negated });
    return true;
  }
  // A one-letter grade needs an operator, so typing a title that starts with "a" stays a title search.
  const grade = bare.length > 1 || bare !== word ? gradeOf(game, bare) : null;
  if (grade !== null) {
    if (negated) query.belowScore = Math.min(query.belowScore ?? Infinity, grade);
    else query.minScore = Math.max(query.minScore ?? 0, grade);
    return true;
  }
  if (negated) return false;

  const codes = GAME_CODES[game];
  const difficulty = (codes.difficulty as readonly string[]).findIndex((_, code) => difficultyNames(game, code).some(name => name.toLowerCase() === word));
  if (difficulty >= 0) {
    query.difficulties.push(difficulty);
    return true;
  }
  const { chartTypes } = getGame(game).presentation;
  const chartType = (codes.chartType as readonly string[]).findIndex(key => key === word || (chartTypes as Record<string, { label: string }>)[key]?.label.toLowerCase() === word);
  if (chartType >= 0) {
    query.chartTypes.push(chartType);
    return true;
  }
  return false;
}

/** Null unless every word of the query is a chart filter. */
export function parseChartQuery(game: CanonicalGameId, text: string): ChartQuery | null {
  const words = text.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  const query: ChartQuery = { levels: [], difficulties: [], chartTypes: [], minScore: null, belowScore: null, statuses: [], played: null, random: false };
  return words.every(word => applyWord(game, query, word)) ? query : null;
}

/** Whether the query narrows by the player's own scores. */
export function needsScores(query: ChartQuery): boolean {
  return query.minScore !== null || query.belowScore !== null || query.statuses.length > 0 || query.played !== null;
}

export function matchesChartQuery(query: ChartQuery, chart: ChartQueryChart, score: ChartQueryScore | null): boolean {
  if (query.levels.length > 0 && !query.levels.some(level => "level" in level
    ? chart.level === level.level
    : chart.levelPrecise >= level.min && chart.levelPrecise <= level.max)) return false;
  if (query.difficulties.length > 0 && !query.difficulties.includes(chart.difficultyCode)) return false;
  if (query.chartTypes.length > 0 && !query.chartTypes.includes(chart.typeCode)) return false;
  if (query.played !== null && (score !== null) !== query.played) return false;

  const filtersScore = query.minScore !== null || query.belowScore !== null || query.statuses.length > 0;
  if (!filtersScore) return true;
  if (!score) return false;
  if (query.minScore !== null && score.scoreValue < query.minScore) return false;
  if (query.belowScore !== null && score.scoreValue >= query.belowScore) return false;
  return query.statuses.every(status => ((score[status.kind] ?? 0) >= status.code) === status.reached);
}

/** A rating calculator query: a chart constant and a score, such as `14.7 100.5` or `14.5 1007500`. */
export function parseRatingQuery(text: string): { levelPrecise: number; score: string } | null {
  const match = /^(\d{1,2}\.\d)\s+(\S+)$/.exec(text.trim());
  return match ? { levelPrecise: tenths(match[1]), score: match[2] } : null;
}
