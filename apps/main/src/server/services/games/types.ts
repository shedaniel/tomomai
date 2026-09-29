import type { EventData, ProfileData, Region } from "@/lib/types";
import type { Flags } from "@/lib/flags";
import type { CanonicalGameId, GameRegionContext } from "@/lib/games/types";
import type { CatalogImagePolicy } from "@/server/services/catalog/ingestion/types";
import type { CatalogChart } from "@/server/services/catalog/ingestion/schema";
import type { CatalogLevelPolicy } from "@/server/services/catalog/ingestion/levels";
import type { CatalogStage } from "@/server/services/catalog/ingestion/runner";
import type { GameSnapshotData } from "@/lib/games/player-view";
import type { FetchStartError } from "./fetch-errors";
import type { FetchRun } from "./fetch-run";

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

/** Everything the shared catalog pipeline needs to know about one game. */
export interface CatalogSource {
  /** The source stages of a region, in merge order. Fill Missing runs after them. */
  stages: (region: Region) => Promise<CatalogStage[]>;
  levelPolicy: (version: number) => CatalogLevelPolicy;
  images: CatalogImagePolicy;
  /** The canonical form of a song title. Every collected title must already be in it. */
  normalizeTitle?: (title: string) => string;
  /** Logs in with a player token for a region the definition's `catalogTokenRegions` lists, and returns the session cookies the source stages read the game site with. */
  authenticate?: (region: Region, token: string) => Promise<string>;
  /** Decodes an upload record in a retired format. Returns undefined for a record in the current format. */
  parseLegacyRecord?: (input: unknown) => CatalogChart | undefined;
}

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
  snapshotId: number;
  gameVersion: number;
  chartResolution: ChartResolutionMap;
};

/** Work that completes a saved snapshot, such as per-play details. It runs after the session completes, so its failure never fails the fetch. */
export type Enrichment = (ctx: PersistedSnapshotContext) => Promise<void>;

export type ScoreFetchOutcome = {
  result: GameFetchResult;
  enrich?: Enrichment;
};

export interface ScoreSource {
  /** Refuses a stored token that cannot start a fetch, before its session exists. A newly supplied token is not checked. */
  rejectStoredToken?: (token: string) => FetchStartError | null;
  fetch: (ctx: ScoreFetchContext, run: FetchRun) => Promise<ScoreFetchOutcome>;
}

export interface ReservedProfileProvider {
  user: (username: string) => Promise<ProfileData | null>;
  snapshot: (username: string, region: Region) => Promise<GameSnapshotData | null>;
}

export interface GameServerModule {
  catalog: CatalogSource;
  scores: ScoreSource;
  reserved?: ReservedProfileProvider;
}
