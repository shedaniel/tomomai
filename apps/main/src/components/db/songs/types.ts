import { GenericFilter } from "@/components/filter-panel";
import { Region } from "@/lib/types";

export interface UniqueSong {
  parentIds: string[];
  index: number;
  songName: string;
  artist: string;
  cover: string;
  type: string;
  genre: string;
  addedVersion: number;
  slug: string;
  aliases: string[];
  difficulties: UniqueSongDifficulty[];
}

export interface UniqueSongDifficulty {
  difficulty: string;
  levelPrecise: number;
  noteDesigner: string | null;
}

export interface UserScore {
  scoreValue: number;
  comboStatus: number;
  syncStatus: number;
  clearStatus: number;
}

export interface SongDetailHistoricalChart {
  difficulty: string;
  levelPrecise: number;
}

export interface SongDetailChart extends SongDetailHistoricalChart {
  level: string;
  addedVersion: number;
  noteDesigner: string | null;
  tapCount: number | null;
  holdCount: number | null;
  slideCount: number | null;
  touchCount: number | null;
  breakCount: number | null;
}

export interface SongDetails {
  parentIds: string[];
  songName: string;
  artist: string;
  cover: string;
  type: string;
  genre: string;
  bpm: number | null;
  addedVersion: number;
  userScores?: Record<string, Record<string, UserScore>>;
  regions: {
    region: Region;
    versions: {
      gameVersion: number;
      charts: (SongDetailChart | SongDetailHistoricalChart)[];
    }[];
  }[];
}

export type UniqueSongFilterType = "type" | "genre" | "addedVersion" | "sort" | "level" | "noteDesigner";

export interface UniqueSongFilter extends GenericFilter {
  type: UniqueSongFilterType;
}

export type GroupMode = "none" | "noteDesigner" | "level_asc" | "level_desc" | "version_asc" | "version_desc" | "genre" | "artist";
