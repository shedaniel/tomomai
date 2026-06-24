// @copied-from apps/main/src/lib/types.ts — temporary duplicate; do not edit manually, change apps/main and re-sync (extracted to a shared package in the catalogue PR).

// Centralized type definitions for the maimai charts application
import { VersionId } from "./metadata";

// ===== CORE TYPES =====

export type Region = "intl" | "jp" | "cn";

export interface User {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

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

// Song data with score information
export type MinimalSong = {
  songId: string;
  songName: string;
  artist: string;
  cover: string;
  type: SongType;
  difficulty: Difficulty;
}

export type MinimalSongForDisplay = MinimalSong & {
  levelPrecise: number;
  achievement: number;
  fc: FullCombo;
  fs: FullSync;
  dxScore: number;
}

export type SongBase = MinimalSong & {
  level: string;
  levelPrecise: number;
  genre: string;
  addedVersion: VersionId;
}

export type SongWithScore = SongBase & MinimalSongForDisplay

export type SongExtended = SongBase & {
  bpm: number | null;
  noteDesigner: string | null;
  tapCount: number | null;
  holdCount: number | null;
  slideCount: number | null;
  touchCount: number | null;
  breakCount: number | null;
};

export interface NoteCounts {
  tap: number;
  hold: number;
  slide: number;
  touch: number;
  break: number;
}

// Event data for area and event area events
export interface EventData {
  eventType: "area" | "eventArea";
  name: string;
  currentDistance: number;
  nextRewardDistance: number | null;
  state: "not_started" | "in_progress" | "completed";
  imageUrl: string;
  eventPeriodStart: Date | null;
  eventPeriodEnd: Date | null;
}

// Complete snapshot data including songs
export interface SnapshotWithSongs<S = SongWithScore> {
  snapshot: Snapshot & {
    title: string;
    titleType: TitleType;
    iconUrl: string;
  };
  songs: S[];
  events?: EventData[];
}

export interface FetchSession {
  id: string;
  status: "pending" | "completed" | "failed";
  startedAt: Date;
  completedAt?: Date;
  errorMessage?: string;
  statusStates?: string; // Comma-separated list of completed states
}

// ===== DATABASE TYPES =====

export type CourseRank =
  | "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10"
  | "R1" | "R2" | "R3" | "R4" | "R5" | "R6" | "R7" | "R8" | "R9" | "R10"
  | "R" | "U";

export type ClassRank =
  | "B5" | "B4" | "B3" | "B2" | "B1"
  | "A5" | "A4" | "A3" | "A2" | "A1"
  | "S5" | "S4" | "S3" | "S2" | "S1"
  | "SS5" | "SS4" | "SS3" | "SS2" | "SS1"
  | "SSS5" | "SSS4" | "SSS3" | "SSS2" | "SSS1"
  | "LEGEND";

export type Difficulty = "basic" | "advanced" | "expert" | "master" | "remaster" | "utage";

export type Level =
  | "1" | "1+" | "2" | "2+" | "3" | "3+" | "4" | "4+" | "5" | "5+"
  | "6" | "6+" | "7" | "7+" | "8" | "8+" | "9" | "9+" | "10" | "10+"
  | "11" | "11+" | "12" | "12+" | "13" | "13+" | "14" | "14+" | "15" | "15+"
  | "16" | "16+";

export type SongType = "std" | "dx";

export type FullCombo = "none" | "fc" | "fc+" | "ap" | "ap+";

export type FullSync = "none" | "sync" | "fs" | "fs+" | "fdx" | "fdx+";

export type TitleType = "normal" | "bronze" | "silver" | "gold" | "rainbow";

export type FetchSessionStatus = "pending" | "completed" | "failed";

// ===== COMPONENT PROP TYPES =====

export interface SnapshotData extends Snapshot {
  // Additional fields that might be needed for UI components
  title?: string;
  iconUrl?: string;
}

// ===== USER & PROFILE TYPES =====

export interface UserData {
  hasUsername: boolean;
  username: string | null;
  email: string;
  publishProfile: boolean;
  region: Region;
  role: "user" | "admin";
}

export interface ProfileSettings {
  publishProfile: boolean;
  profileMainRegion: Region;
  profileShowAllScores: boolean;
  profileShowScoreDetails: boolean;
  profileShowPlates: boolean;
  profileShowPlayCounts: boolean;
  profileShowEvents: boolean;
  profileShowInSearch: boolean;
  fetchUseAlbums: boolean | null;
}

export interface ProfileData {
  id: string;
  name: string;
  publishProfile: boolean;
  profileMainRegion: Region;
  profileShowAllScores: boolean;
  profileShowScoreDetails: boolean;
  profileShowPlates: boolean;
  profileShowPlayCounts: boolean;
  profileShowEvents: boolean;
  profileShowInSearch: boolean;
}

export interface ProfilePrivacySettings {
  profileShowAllScores: boolean;
  profileShowScoreDetails: boolean;
  profileShowPlates: boolean;
  profileShowPlayCounts: boolean;
  profileShowEvents: boolean;
  profileShowInSearch: boolean;
}
