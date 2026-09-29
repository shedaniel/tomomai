import type { FetchState } from "@/lib/fetch-states";
import type { CodeKey } from "./codes";
import type { CanonicalGameId, Region } from "./ids";
import type { VersionTable } from "./version-table";

export { CANONICAL_GAME_IDS, type CanonicalGameId } from "./ids";

export type GameRegionContext = {
  game: CanonicalGameId;
  region: Region;
};

export const GAME_CAPABILITIES = [
  "catalog",
  "scores",
  "recents",
  "albums",
  "events",
  "rankings",
  "rating",
  "plates",
  "score-details",
] as const;
export type GameCapability = (typeof GAME_CAPABILITIES)[number];

export type RankedScore = {
  scoreValue: number;
  addedVersion: number;
  rating: number;
};

export type RankingSelection<T extends RankedScore> = {
  newScores: T[];
  oldScores: T[];
  newRemaining: T[];
  oldRemaining: T[];
};

export type RankingBucketSizes = {
  new: number;
  old: number;
};

export type ChartRatingInput = {
  scoreValue: number;
  levelPrecise: number;
  difficultyCode: number;
  comboStatus: number;
};

/** A rating a chart earns beyond its score, such as maimai's all perfect bonus. */
export type RatingBonus = {
  label: string;
  /** The score the bonus is shown at. */
  scoreValue: number;
  /** The combo statuses that earn it. The first one rates the bonus row. */
  comboStatuses: readonly number[];
};

export type GameRating = {
  bucketSizes: RankingBucketSizes;
  /** The precise rating. Rankings order by it and count its integer part. */
  chartRating(input: ChartRatingInput, version: number): number;
  isNew(addedVersion: number, currentVersion: number): boolean;
  isRated(difficultyCode: number): boolean;
  /** The player rating from the integer ratings of the selected charts. */
  playerRating(ratings: readonly number[]): number;
  bonuses(version: number): readonly RatingBonus[];
};

export const SCORE_STATUS_KINDS = ["comboStatus", "syncStatus", "clearStatus"] as const;
export type ScoreStatusKind = (typeof SCORE_STATUS_KINDS)[number];

export type DifficultyPresentation = {
  label: string;
  shortLabel: string;
  /** Levels publish no decimal, so they read as "14.?". */
  unknownDecimal?: true;
  hex: string;
  cssVar: string;
  classes: {
    /** Text on the page background. */
    text: string;
    /** A tinted cell or chip. It sets its own text and border colours, because a light cell stays light in dark mode. */
    cell: string;
    /** A solid fill under white text. */
    solidBg: string;
    /** A small label chip in a catalog row. */
    chip: string;
    border: string;
    ring: string;
    /** The level badge on recent plays and albums. */
    badge: string;
    /** The level badge on score and catalog cards. */
    cardBadge: string;
  };
};

export type ChartTypePresentation = {
  label: string;
  ogLabel?: string;
  /** Relative to NEXT_PUBLIC_R2_URL. */
  badgePath?: string;
  /** Every chart of the game has this type, so it is never shown. */
  implicit?: true;
  hex: string;
  classes: { ring: string; chip: string };
};

export type StatusStyle = { label: string; className: string };

export type StatusColumn = {
  labelKey: "fc" | "fs" | "status";
  kinds: readonly ScoreStatusKind[];
};

export type GradeRow = {
  min: number;
  label: string;
  /** Listed as a reference score in the chart rating table. */
  benchmark?: true;
};

export type RatingRules = {
  /** Stored ratings are the shown rating times this. */
  scale: 1 | 100;
  aggregation: "sum" | "average";
  /** The rating history axis step, in stored units. */
  axisStep: number;
  /** The chart rating distribution bar width, in stored units. */
  distributionStep: number;
  /** The recommendation target rating filter bucket width, in stored units. */
  filterBucketWidth: number;
};

type PresentationOf<G extends CanonicalGameId> = {
  formatScore(value: number, precision: "full" | "compact"): string;
  /** The difference between two scores as shown at compact precision. */
  formatScoreDelta(from: number, to: number): string;
  scoreLabel: "achievement" | "score";
  ratingRules: RatingRules;
  difficulties: { readonly [K in CodeKey<G, "difficulty">]: DifficultyPresentation };
  chartTypes: { readonly [K in CodeKey<G, "chartType">]: ChartTypePresentation };
  /** A status mapped to null is not shown. */
  statusStyles: { readonly [S in ScoreStatusKind]: { readonly [K in CodeKey<G, S>]: StatusStyle | null } };
  statusColumns: readonly StatusColumn[];
  /** Highest first. The last row is the floor. */
  grades: readonly GradeRow[];
  /** Hosts whose images browsers load through /api/image-proxy instead of directly. */
  imageProxyHosts: readonly string[];
};

/** Keyed by code key, so a key added to a game's code table needs its presentation. */
export type GamePresentation<G extends CanonicalGameId = CanonicalGameId> = G extends CanonicalGameId ? PresentationOf<G> : never;

export type CatalogSection = "songs" | "stats" | "events" | "posts";

export type GameBrand = {
  productName: "tomomai" | "tomochu";
  japaneseName: string;
  displayName: string;
  netName: string;
};

export type GameSite = {
  entryUrl: string;
  maintenance: {
    startHour: number;
    endHour: number;
    weekdayEndHours?: Partial<Record<number, number>>;
  };
};

export interface GameDefinition {
  id: CanonicalGameId;
  brand: GameBrand;
  sites: Partial<Record<Region, GameSite>>;
  capabilities: readonly GameCapability[];
  versions: VersionTable;
  rating: GameRating;
  presentation: GamePresentation;
  catalogSections: readonly CatalogSection[];
  fetchStages: readonly FetchState[];
  fetch: { cookieLogin: { region: Region; url: string } | null };
}

export type GameAdapterErrorCode =
  | "UNKNOWN_GAME"
  | "GAME_NOT_ENABLED"
  | "UNSUPPORTED_REGION"
  | "UNSUPPORTED_CAPABILITY";

export class GameAdapterError extends Error {
  constructor(
    public readonly code: GameAdapterErrorCode,
    message: string,
    public readonly game?: CanonicalGameId,
    public readonly region?: Region,
    public readonly capability?: GameCapability,
  ) {
    super(message);
    this.name = "GameAdapterError";
  }
}
