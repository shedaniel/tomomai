import type { EventData, Region } from "@/lib/types";
import type { Flags } from "@/lib/flags";
import type { CanonicalGameId, GameRegionContext } from "@/lib/games/types";
import type { CatalogFetchContext } from "@/server/services/catalog/ingestion/types";
import type { CatalogChart } from "@/server/services/catalog/ingestion/normalize-charts";

export type ChartRef = GameRegionContext & {
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
};

export type NormalizedScore = {
  chart: ChartRef;
  scoreValue: number;
  secondaryScore: number;
  comboStatus: number;
  syncStatus: number;
  clearStatus: number;
};

export type NormalizedRecent = NormalizedScore & {
  playedAt: Date;
  maxDxScore?: number;
  track?: number;
  details?: Record<string, unknown>;
};

export type NormalizedEvent = {
  name: string;
} & Partial<Omit<EventData, "name">>;

export type GameFetchResult = {
  player: NormalizedPlayer;
  scores: NormalizedScore[];
  recents?: NormalizedRecent[];
  events?: NormalizedEvent[];
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
  signal: AbortSignal;
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
