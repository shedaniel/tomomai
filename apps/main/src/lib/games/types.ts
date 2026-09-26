import type { Region, EventData } from "@/lib/types";
import type { Flags } from "@/lib/flags";
import type { CatalogFetchContext } from "@/server/services/catalog/ingestion/types";
import type { CatalogChart } from "@/server/services/catalog/ingestion/normalize-charts";

export const CANONICAL_GAME_IDS = ["maimai", "chunithm"] as const;
export type CanonicalGameId = (typeof CANONICAL_GAME_IDS)[number];

export type GameContext = {
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

export type ChartRef = GameContext & {
  version: number;
  songName: string;
  chartType: number;
  difficulty: number;
};

export type NormalizedPlayer = {
  displayName: string;
  rating: number;
  title: string;
  titleType: number;
  iconUrl: string;
  totalPlayCount: number;
  currentVersionPlayCount: number;
  courseRankUrl?: string;
  classRankUrl?: string;
  stars?: number;
  metadata?: Record<string, unknown>;
};

export type NormalizedScore = {
  chart: ChartRef;
  scoreValue: number;
  secondaryScore: number;
  comboStatus: number;
  syncStatus: number;
  clearStatus: number;
  details?: Record<string, unknown>;
};

export type NormalizedRecent = NormalizedScore & {
  playedAt: Date;
  maxDxScore?: number;
  track?: number;
};

export type NormalizedAlbum = {
  chart: ChartRef;
  capturedAt: Date;
  imageKey?: string;
  imageSize?: number;
  venue?: string;
  metadata?: Record<string, unknown>;
};

export type NormalizedEvent = {
  name: string;
  metadata?: Record<string, unknown>;
} & Partial<Omit<EventData, "name">>;

export type GameFetchResult = {
  player: NormalizedPlayer;
  scores: NormalizedScore[];
  recents?: NormalizedRecent[];
  albums?: NormalizedAlbum[];
  events?: NormalizedEvent[];
};

export const RANKING_BUCKET = {
  new: 1,
  old: 2,
} as const;
export type RankingBucket = (typeof RANKING_BUCKET)[keyof typeof RANKING_BUCKET];

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

export interface ConfiguredCatalogAdapter {
  configured: true;
  requiresToken?: (region: Region) => boolean;
  authenticate?: (region: Region, token: string) => Promise<string>;
  collect: (ctx: CatalogFetchContext) => Promise<CatalogChart[]>;
}

export type CatalogSourceAdapter = ConfiguredCatalogAdapter | { configured: false; notConfiguredReason: string };

export type ScoreTokenValidationContext = {
  game: CanonicalGameId;
  userId: string;
  region: Region;
  flags: Flags;
  token: string;
  tokenProvided: boolean;
};

export type ScoreFetchContext = {
  game: CanonicalGameId;
  userId: string;
  region: Region;
  sessionId: bigint;
  gameVersion: number;
  flags: Flags;
  token: string;
  shouldFetchAlbums: boolean;
};

export type ChartResolutionMap = Map<string, bigint>;

export type PersistedSnapshotContext = {
  game: CanonicalGameId;
  userId: string;
  region: Region;
  sessionId: bigint;
  snapshotId: number;
  gameVersion: number;
  chartResolution: ChartResolutionMap;
};

export interface ConfiguredScoreAdapter {
  configured: true;
  cookieLoginUrl?: string;
  validateToken?: (ctx: ScoreTokenValidationContext) => void | Promise<void>;
  fetch: (ctx: ScoreFetchContext) => Promise<{
    result: GameFetchResult;
    persistExtra?: (
      ctx: PersistedSnapshotContext,
      backgroundWorkRef?: { promise: Promise<void> },
    ) => Promise<void>;
  }>;
}

export type ScoreAdapter = ConfiguredScoreAdapter | { configured: false; notConfiguredReason: string };

export type GameCodeMaps = {
  chartType: Readonly<Record<number, string>>;
  difficulty: Readonly<Record<number, string>>;
  comboStatus: Readonly<Record<number, string>>;
  syncStatus: Readonly<Record<number, string>>;
  clearStatus: Readonly<Record<number, string>>;
  titleType: Readonly<Record<number, string>>;
  rankingBucket: Readonly<Record<number, string>>;
};

export interface GameAdapter {
  game: CanonicalGameId;
  capabilities: ReadonlySet<GameCapability>;
  supportedRegions: ReadonlySet<Region>;
  versions: VersionProvider;
  codes: GameCodeMaps;
  calculateChartRating(input: { scoreValue: number; levelPrecise: number; difficulty: number; comboStatus?: number }, version: number): number;
  selectRankings<T extends RankedScore>(scores: T[], currentVersion: number): RankingSelection<T>;
}

export type GameAdapterErrorCode =
  | "UNKNOWN_GAME"
  | "GAME_NOT_ENABLED"
  | "UNSUPPORTED_REGION"
  | "UNSUPPORTED_CAPABILITY"
  | "SOURCE_NOT_CONFIGURED";

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
