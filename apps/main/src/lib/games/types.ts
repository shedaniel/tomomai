import type { FetchState } from "@/lib/fetch-states";
import type { CanonicalGameId, Region } from "./ids";

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

export type GameVersionInfo = {
  id: number;
  name: string;
  shortName: string;
  releaseDate: string;
};

export interface VersionProvider {
  getAvailableVersions(region: Region): GameVersionInfo[];
  getCurrentVersion(region: Region): number;
  getVersionInfo(region: Region, version: number): GameVersionInfo | null;
}

export type RankedScore = {
  chartId: string;
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

type ChartRatingInput = {
  scoreValue: number;
  levelPrecise: number;
  difficulty: number;
  comboStatus?: number;
};

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
  versions: VersionProvider;
  rating: {
    bucketSizes: RankingBucketSizes;
    chartRating(input: ChartRatingInput, version: number): number;
    selectRankings<T extends RankedScore>(scores: T[], currentVersion: number): RankingSelection<T>;
  };
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
