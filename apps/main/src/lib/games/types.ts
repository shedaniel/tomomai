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
  "profile-icon",
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

export interface GameAdapter {
  game: CanonicalGameId;
  capabilities: ReadonlySet<GameCapability>;
  supportedRegions: ReadonlySet<Region>;
  versions: VersionProvider;
  fetch: { cookieLogin: { region: Region; url: string } | null };
  calculateChartRating(input: { scoreValue: number; levelPrecise: number; difficulty: number; comboStatus?: number }, version: number): number;
  selectRankings<T extends RankedScore>(scores: T[], currentVersion: number): RankingSelection<T>;
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
