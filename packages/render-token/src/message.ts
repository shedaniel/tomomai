import type {
  FullCombo,
  FullSync,
  NoteCounts,
  Region,
  Route,
  TitleType,
} from "./types";

/**
 * Common header authenticated by the token HMAC. Contains exactly the fields
 * `renderHeader()` in apps/render needs for the image header — nothing the
 * client can forge without breaking the signature.
 */
export interface RenderHeader {
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
 * levelPrecise, type, addedVersion, level) are joined from `/api/v1/songs`
 * by `songId` at render time — they never travel in the token.
 */
export interface ChartRecord {
  /** `songs.publicId` — the nanoid that `/api/v1/songs` exposes as `songId`. */
  songId: string;
  achievement: number;
  fc: FullCombo;
  fs: FullSync;
}

export interface ExportImagePayload {
  visitableProfileAt: string | null;
  charts: ChartRecord[];
}

export interface TrackRecord {
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

export interface LastCreditPayload {
  /** Unix seconds — the credit's first-track time. */
  playedAt: number;
  tracks: TrackRecord[];
}

export interface DailyPlaysPayload {
  /** "YYYY-MM-DD" (JST play-day). */
  day: string;
  plays: ChartRecord[];
}

export type RenderMessage =
  | { route: "export-image"; header: RenderHeader; payload: ExportImagePayload }
  | { route: "last-credit"; header: RenderHeader; payload: LastCreditPayload }
  | { route: "daily-plays"; header: RenderHeader; payload: DailyPlaysPayload };
