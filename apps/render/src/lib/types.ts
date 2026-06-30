/**
 * Type definitions used by the render pipeline. Slimmed from the original
 * apps/main copy — only the types render-image.ts and rating-calculator.ts
 * actually consume. Everything else (User, ProfileData, CourseRank, EventData,
 * …) was dead weight and is deleted.
 *
 * `VersionId` is now just `number` — it always was (typeof Versions[...]['id']),
 * and the token carries it as a plain byte. No version calendar needed.
 */

export type Region = "intl" | "jp" | "cn";

export type Difficulty = "basic" | "advanced" | "expert" | "master" | "remaster" | "utage";

export type SongType = "std" | "dx";

export type FullCombo = "none" | "fc" | "fc+" | "ap" | "ap+";

export type FullSync = "none" | "sync" | "fs" | "fs+" | "fdx" | "fdx+";

export type TitleType = "normal" | "bronze" | "silver" | "gold" | "rainbow";

/** Game version id (e.g. 12 = BUDDiES, 13 = PRiSM). Token carries this as u8. */
export type VersionId = number;

export interface Snapshot {
  id: string;
  fetchedAt: Date;
  rating: number;
  displayName: string;
  gameVersion: VersionId;
  courseRankUrl: string;
  classRankUrl: string;
  stars: number;
  versionPlayCount: number;
  totalPlayCount: number;
}

export interface SongBase {
  songId: string;
  songName: string;
  artist: string;
  cover: string;
  type: SongType;
  difficulty: Difficulty;
  level: string;
  levelPrecise: number;
  genre: string;
  addedVersion: VersionId;
}

export interface SongWithScore extends SongBase {
  levelPrecise: number;
  achievement: number;
  fc: FullCombo;
  fs: FullSync;
  dxScore: number;
}

export interface SnapshotWithSongs<S = SongWithScore> {
  snapshot: Snapshot & {
    title: string;
    titleType: TitleType;
    iconUrl: string;
  };
  songs: S[];
}

// ---- last-credit / daily-plays render types ----

export interface SnapshotMetadata {
  id: string;
  fetchedAt: Date;
  gameVersion: VersionId;
  rating: number;
  iconUrl: string;
  displayName: string;
  title: string;
  titleType: TitleType;
  courseRankUrl: string;
  classRankUrl: string;
  stars: number;
}

export interface RecentSongDetails {
  fastCount: number;
  lateCount: number;
  combo: number;
  maxCombo: number;
  syncScore: number | null;
  maxSyncScore: number | null;
  rating: number;
  ratingChange: number;
  venue: string | null;
  tapCPerfect: number;
  tapPerfect: number;
  tapGreat: number;
  tapGood: number;
  tapMiss: number;
  holdCPerfect: number;
  holdPerfect: number;
  holdGreat: number;
  holdGood: number;
  holdMiss: number;
  slideCPerfect: number;
  slidePerfect: number;
  slideGreat: number;
  slideGood: number;
  slideMiss: number;
  touchCPerfect: number;
  touchPerfect: number;
  touchGreat: number;
  touchGood: number;
  touchMiss: number;
  breakCPerfect: number;
  breakPerfect: number;
  breakGreat: number;
  breakGood: number;
  breakMiss: number;
}

export interface RecentSongData {
  id: bigint;
  playedAt: Date;
  achievement: number;
  dxScore: number;
  maxDxScore: number;
  fc: FullCombo;
  fs: FullSync;
  track: number;
  songName: string;
  artist: string;
  cover: string;
  difficulty: string;
  level: string;
  levelPrecise: number;
  type: string;
  addedVersion: number;
  details: RecentSongDetails | null;
}

export interface CreditData {
  playedAt: Date;
  tracks: RecentSongData[];
}
