import type {
  FullCombo,
  FullSync,
  NoteCounts,
  Region,
  TitleType,
} from "./types";

/**
 * The header of a maimai image, authenticated by the token HMAC. Contains exactly the fields
 * `renderHeader()` in apps/render needs for the image header — nothing the
 * client can forge without breaking the signature.
 */
export interface MaimaiRenderHeader {
  scale: 1 | 2;
  /** Unix seconds. Render rejects if `now > exp`. */
  exp: number;
  gameVersion: number;
  region: Region;
  /** Player DX rating (the big number on the rating frame). */
  rating: number;
  displayName: string;
  iconUrl: string;
  title: string;
  titleType: TitleType;
  classRankUrl: string;
  courseRankUrl: string;
}

/**
 * A chart score. The chart's catalog fields (songName, cover, difficulty,
 * levelPrecise, type, addedVersion, level) are joined from `/api/v1/games/maimai/songs`
 * by `songId` at render time — they never travel in the token.
 */
export interface MaimaiChartRecord {
  /** Composite chart instance ID exposed by `/api/v1/games/maimai/songs`. */
  songId: string;
  achievement: number;
  fc: FullCombo;
  fs: FullSync;
}

export interface MaimaiExportImagePayload {
  visitableProfileAt: string | null;
  charts: MaimaiChartRecord[];
}

export interface MaimaiTrackRecord {
  songId: string;
  achievement: number;
  fc: FullCombo;
  fs: FullSync;
  dxScore: number;
  maxDxScore: number;
  /** Null = dimmed detail table (no judgment breakdown available). */
  details: {
    fastCount: number;
    lateCount: number;
    tap: NoteCounts;
    hold: NoteCounts;
    slide: NoteCounts;
    touch: NoteCounts;
    break: NoteCounts;
  } | null;
}

export interface MaimaiLastCreditPayload {
  /** Unix seconds — the credit's first-track time. */
  playedAt: number;
  tracks: MaimaiTrackRecord[];
}

export interface MaimaiDailyPlaysPayload {
  /** "YYYY-MM-DD" (JST play-day). */
  day: string;
  plays: MaimaiChartRecord[];
}

/** The header of a CHUNITHM image: the player as CHUNITHM-NET shows them. */
export interface ChunithmRenderHeader {
  scale: 1 | 2;
  /** Unix seconds. Render rejects if `now > exp`. */
  exp: number;
  gameVersion: number;
  region: Region;
  /** Player rating ×100, so 17.25 is 1725. */
  rating: number;
  displayName: string;
  iconUrl: string;
  title: string;
}

/**
 * A CHUNITHM chart score. Catalog fields are joined from `/api/v1/games/chunithm/songs` by `songId`, and
 * the statuses are codes of the game's table at `/api/v1/games/chunithm/codes`.
 */
export interface ChunithmChartRecord {
  songId: string;
  scoreValue: number;
  comboStatus: number;
  syncStatus: number;
  clearStatus: number;
  /** The chart's rating at this score ×100, so 17.65 is 1765. */
  rating: number;
}

export interface ChunithmExportImagePayload {
  visitableProfileAt: string | null;
  /** The rating's charts from the current version, best first. */
  newCharts: ChunithmChartRecord[];
  /** The rating's charts from earlier versions, best first. */
  oldCharts: ChunithmChartRecord[];
}

export interface ChunithmDailyPlaysPayload {
  /** "YYYY-MM-DD" (JST play-day). */
  day: string;
  plays: ChunithmChartRecord[];
}

export type RenderMessage =
  | { game: "maimai"; route: "export-image"; header: MaimaiRenderHeader; payload: MaimaiExportImagePayload }
  | { game: "maimai"; route: "last-credit"; header: MaimaiRenderHeader; payload: MaimaiLastCreditPayload }
  | { game: "maimai"; route: "daily-plays"; header: MaimaiRenderHeader; payload: MaimaiDailyPlaysPayload }
  | { game: "chunithm"; route: "export-image"; header: ChunithmRenderHeader; payload: ChunithmExportImagePayload }
  | { game: "chunithm"; route: "daily-plays"; header: ChunithmRenderHeader; payload: ChunithmDailyPlaysPayload };
