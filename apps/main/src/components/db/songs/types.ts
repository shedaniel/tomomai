import { GenericFilter } from "@/components/filter-panel";
import { VersionId } from "@/lib/metadata";
import { Difficulty, Region, SongType } from "@/lib/types";

export interface UniqueSong {
  index: number;
  songName: string;
  artist: string;
  cover: string;
  type: SongType;
  genre: string;
  addedVersion: VersionId;
  slug: string;
  aliases: string[];
  difficulties: UniqueSongDifficulty[];
}

export interface UniqueSongDifficulty {
  difficulty: Difficulty;
  levelPrecise: number;
  noteDesigner: string | null;
}

export interface UserScore {
  achievement: number;
  fc: string;
  fs: string;
}

export interface SongDetailHistoricalChart {
  difficulty: Difficulty;
  levelPrecise: number;
}

export interface SongDetailChart extends SongDetailHistoricalChart {
  level: string;
  addedVersion: VersionId;
  noteDesigner: string | null;
  tapCount: number | null;
  holdCount: number | null;
  slideCount: number | null;
  touchCount: number | null;
  breakCount: number | null;
}

export interface SongDetails {
  songName: string;
  artist: string;
  cover: string;
  type: SongType;
  genre: string;
  bpm: number | null;
  addedVersion: VersionId;
  userScores?: Record<string, Record<string, UserScore>>;
  regions: {
    region: Region;
    versions: {
      gameVersion: VersionId;
      charts: (SongDetailChart | SongDetailHistoricalChart)[];
    }[];
  }[];
}

export type UniqueSongFilterType = "type" | "genre" | "addedVersion" | "sort" | "level" | "noteDesigner";

export interface UniqueSongFilter extends GenericFilter {
  type: UniqueSongFilterType;
}

export type GroupMode = "none" | "noteDesigner" | "level_asc" | "level_desc" | "version_asc" | "version_desc" | "genre" | "artist";
