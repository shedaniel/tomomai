import type { RenderMessage } from "@tomomai/render-token";
import type { ProfileData } from "@/lib/types";
import type { Region, CanonicalGameId } from "@/lib/games/ids";
import type { Flags } from "@/lib/flags";
import type { GameRegionContext } from "@/lib/games/types";
import type { CatalogImagePolicy } from "@/server/services/catalog/ingestion/types";
import type { CatalogChart } from "@/server/services/catalog/ingestion/schema";
import type { CatalogLevelPolicy } from "@/server/services/catalog/ingestion/levels";
import type { CatalogStage } from "@/server/services/catalog/ingestion/runner";
import type { GameEvent, GameSnapshotData } from "@/lib/games/player-view";
import type { RecentPlayDetails } from "@/lib/games/recent-details";
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
  track: number;
  maxSecondaryScore?: number;
};

export type GameFetchResult = {
  player: NormalizedPlayer;
  scores: NormalizedScore[];
  recents?: NormalizedRecent[];
  events?: GameEvent[];
};

/** Everything the shared catalog pipeline needs to know about one game. */
export interface CatalogSource {
  /** The source stages of a region, in merge order. Fill Missing runs after them. */
  stages: (region: Region) => Promise<CatalogStage[]>;
  levelPolicy: (version: number) => CatalogLevelPolicy;
  images: CatalogImagePolicy;
  /** Logs in with a player token for a region the definition's `catalogTokenRegions` lists, and returns the session cookies the source stages read the game site with. */
  authenticate?: (region: Region, token: string) => Promise<string>;
  /** Decodes an upload record in a retired format, which the upload contract then validates like any other. Returns undefined for a record in the current format. */
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

/** Catalog song ids by chartKey, for one game, region and version. */
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
  /** Lowercase usernames of the game's demo profiles, which no account may take. */
  usernames: ReadonlySet<string>;
  user: (username: string) => Promise<ProfileData | null>;
  snapshot: (username: string, region: Region) => Promise<GameSnapshotData | null>;
}

export type ImageMessageResult =
  | { ok: true; message: RenderMessage }
  | { ok: false; status: number; error: string };

export type ExportImageRequest = {
  snapshotId: string;
  /** With `region`, names a demo profile whose snapshot is not stored. */
  username?: string;
  region?: Region;
  scale: 1 | 2;
  ttlSeconds?: number;
};

export type DailyPlaysImageRequest = {
  userId: string;
  region: Region;
  /** "YYYY-MM-DD". The latest play day when left out. */
  day?: string;
  scale: 1 | 2;
  ttlSeconds?: number;
};

/** Builds the signed messages of the game's images. Which of them a site serves is the game's capabilities. */
export interface GameImageBuilders {
  /** The rating image of a snapshot (capability `image-export`). */
  exportImage: (request: ExportImageRequest) => Promise<ImageMessageResult>;
  /** The plays of one play day (capability `daily-plays`). */
  dailyPlays: (request: DailyPlaysImageRequest) => Promise<ImageMessageResult>;
}

/** A stored recent play as the shared recents query reads it, before its game adds the details. */
export type StoredRecentPlay = {
  recentSongId: bigint;
  maxSecondaryScore: number | null;
  metadata: unknown;
};

export interface GameServerModule<G extends CanonicalGameId = CanonicalGameId> {
  catalog: CatalogSource;
  scores: ScoreSource;
  /** The game's demo profiles. Having a provider is what turns reserved accounts on. */
  reserved?: ReservedProfileProvider;
  /** Reads what only this game records about each of a page of recent plays, in the same order. */
  recentDetails: (plays: readonly StoredRecentPlay[]) => Promise<RecentPlayDetails<G>[]>;
  images: GameImageBuilders;
}
