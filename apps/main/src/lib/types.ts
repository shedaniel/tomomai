import type { Region } from "./games/ids";

// ===== CORE TYPES =====

export interface User {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

export interface NoteCounts {
  tap: number;
  hold: number;
  slide: number;
  touch: number;
  break: number;
}

export interface FetchSession {
  id: string;
  status: "pending" | "completed" | "failed";
  startedAt: Date;
  completedAt?: Date;
  errorMessage?: string;
  statusStates?: string; // Comma-separated list of completed states
}

// ===== USER & PROFILE TYPES =====

export interface UserData {
  hasUsername: boolean;
  username: string | null;
  email: string;
  publishProfile: boolean;
  /** The dashboard region preference for the served game, null when none is set. */
  region: Region | null;
  role: "user" | "admin";
}

export interface ProfileSettings {
  publishProfile: boolean;
  profileDescription: string | null;
  profileMainRegion: Region | null;
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
  profileDescription: string | null;
  profileMainRegion: Region | null;
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
