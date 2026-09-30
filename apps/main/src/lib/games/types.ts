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
  "catalog-stats",
  "posts",
  "scores",
  "recents",
  "albums",
  "events",
  "rankings",
  "rating",
  "rating-plate",
  "rating-distribution",
  "plates",
  "score-details",
  "stats",
  "percentiles",
  "daily-plays",
  "snapshot-copy",
  "snapshot-export",
  "image-export",
  "developer-export",
  "assistant",
  "minigames",
  "og-images",
  "community-banner",
  "reserved-accounts",
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
  /** The score's name, a key in each message namespace that labels scores. */
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

export type CatalogSectionId = "songs" | "stats" | "events" | "posts" | "arcades";

/** A page under /db. */
export type CatalogSection = {
  id: CatalogSectionId;
  /** The section exists only while the served game offers this capability. */
  requires?: GameCapability;
  /** Reachable by its URL but left out of the navigation and the sitemap. */
  hidden?: true;
};

/** A site section with its own wordmark. */
export type BrandSection = "dashboard" | "db";

/** Artwork paths are site paths of files in public/. */
export type GameBrand = {
  productName: "tomomai" | "tomochu";
  japaneseName: string;
  /** The game's own name. */
  displayName: string;
  /** The game's official player site. */
  netName: string;
  domain: string;
  /** The square icon for home screens and structured data. */
  icon: string | null;
  /** Light and dark wordmarks. Without them the brand title is set as text. */
  logos: { width: number; height: number; sections: Record<BrandSection, { light: string; dark: string }> } | null;
  /** Artwork drawn on OpenGraph images. Without it they set the brand as text. */
  og: { logo: string; dbLogo: string } | null;
  /** Profiles of the site elsewhere, for structured data. */
  sameAs: readonly string[];
  exampleProfile?: { username: string; region: Region };
  communityInviteUrl?: string;
};

export type GameSite = {
  origin: string;
  /** Path of the NET's mobile pages. Site paths resolve against it. */
  mobileRoot: string;
  /** The site signs in through the SEGA Aime gateway with these parameters. */
  aime?: { siteId: string; backUrl: string };
  /** Skip certificate verification for a host whose chain Node cannot verify. */
  legacyTls?: true;
  maintenance: {
    startHour: number;
    endHour: number;
    weekdayEndHours?: Partial<Record<number, number>>;
  };
};

/** A way a player signs in to fetch scores: SEGA ID credentials, a SEGA Aime gateway cookie, or the maimai China providers. */
export type LoginMethod = "sega-account" | "sega-cookie" | "maimai-cn";

export interface GameDefinition {
  id: CanonicalGameId;
  brand: GameBrand;
  sites: Partial<Record<Region, GameSite>>;
  capabilities: readonly GameCapability[];
  /** Capabilities the game does not offer in a region, although it offers them elsewhere. */
  regionCapabilityOverrides?: Partial<Record<Region, readonly GameCapability[]>>;
  versions: VersionTable;
  rating: GameRating;
  presentation: GamePresentation;
  /** In navigation order. */
  catalogSections: readonly CatalogSection[];
  fetchStages: readonly FetchState[];
  /** How players sign in to fetch scores in each region. A `sega-cookie` region's site must sign in through the gateway. */
  loginMethods: Partial<Record<Region, readonly LoginMethod[]>>;
  /** Regions whose catalog source reads the game site, so collecting their catalog needs a player token. */
  catalogTokenRegions: readonly Region[];
}
