// Centralized type definitions for the maimai charts application

// ===== CORE TYPES =====

export type Region = "intl" | "jp";

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
  gameVersion: number;
  courseRankUrl: string;
  classRankUrl: string;
  stars: number;
  versionPlayCount: number;
  totalPlayCount: number;
}

// Song data with score information
export interface SongWithScore {
  songId: string;
  songName: string;
  artist: string;
  cover: string;
  difficulty: Difficulty;
  level: string;
  levelPrecise: number;
  type: "std" | "dx";
  genre: string;
  addedVersion: number;
  achievement: number;
  dxScore: number;
  fc: "none" | "fc" | "fc+" | "ap" | "ap+";
  fs: "none" | "sync" | "fs" | "fs+" | "fdx" | "fdx+";
}

// Event data for area and event area events
export interface EventData {
  id: string;
  snapshotId: string;
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
export interface SnapshotWithSongs {
  snapshot: Snapshot & {
    title: string;
    iconUrl: string;
  };
  songs: SongWithScore[];
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

export type FetchSessionStatus = "pending" | "completed" | "failed";

// ===== COMPONENT PROP TYPES =====

export interface SnapshotData extends Snapshot {
  // Additional fields that might be needed for UI components
  title?: string;
  iconUrl?: string;
}

// ===== API RESPONSE TYPES =====

export interface GetSnapshotsResponse {
  snapshots: Snapshot[];
}

export interface HasTokenResponse {
  hasToken: boolean;
}

export interface GetTimezoneResponse {
  timezone: string | null;
}

// ===== USER & PROFILE TYPES =====

export interface UserData {
  hasUsername: boolean;
  username: string | null;
  publishProfile: boolean;
  region: Region | null;
  role: "user" | "admin";
}

export interface ProfileSettings {
  publishProfile: boolean;
  profileMainRegion: 'intl' | 'jp';
  profileShowAllScores: boolean;
  profileShowScoreDetails: boolean;
  profileShowPlates: boolean;
  profileShowPlayCounts: boolean;
  profileShowEvents: boolean;
  profileShowInSearch: boolean;
}

export interface ProfileData {
  id: string;
  name: string;
  timezone: string | null;
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