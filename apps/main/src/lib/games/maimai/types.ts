import type { CodeKey } from "@tomomai/games/codes";
import type { EventData } from "@/lib/types";
import type { VersionId } from "./versions";

export type Difficulty = CodeKey<"maimai", "difficulty">;

export type SongType = CodeKey<"maimai", "chartType">;

export type FullCombo = CodeKey<"maimai", "comboStatus">;

export type FullSync = CodeKey<"maimai", "syncStatus">;

export type TitleType = CodeKey<"maimai", "titleType">;

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

type SongBase = MinimalSong & {
  level: string;
  levelPrecise: number;
  genre: string;
  addedVersion: VersionId;
}

export type SongWithScore = SongBase & MinimalSongForDisplay

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
