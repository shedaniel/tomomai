import type { Region } from "./games/ids";
import type { ProfileAudience, ProfileAudienceSettings } from "./profile-audience";

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
  region: Region;
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
  image: string | null;
  profileVisibility: ProfileAudience;
  /** The dashboard region preference for the served game, null when none is set. */
  region: Region | null;
  role: "user" | "admin";
}

export type ProfileSettings = ProfileAudienceSettings & {
  profileDescription: string | null;
  profileMainRegion: Region | null;
  friendsEnabled: boolean;
  fetchUseAlbums: boolean | null;
};

/** A profile as one visitor sees it: the switches say what this visitor may see. */
export interface ProfileData {
  id: string;
  name: string;
  profileDescription: string | null;
  profileMainRegion: Region | null;
  profileShowAllScores: boolean;
  profileShowScoreDetails: boolean;
  profileShowPlates: boolean;
  profileShowPlayCounts: boolean;
  profileShowEvents: boolean;
  profileShowInSearch: boolean;
}

/** What one visitor may see of a profile, resolved from its audiences by privacyFor. */
export interface ProfilePrivacySettings {
  profileShowAllScores: boolean;
  profileShowScoreDetails: boolean;
  profileShowPlates: boolean;
  profileShowPlayCounts: boolean;
  profileShowEvents: boolean;
  profileShowInSearch: boolean;
}
