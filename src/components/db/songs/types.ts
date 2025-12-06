import { GenericFilter } from "@/components/filter-panel";
import { Difficulty, Region, SongExtended, SongType } from "@/lib/types";

export interface UniqueSong {
  index: number;
  songName: string;
  artist: string;
  cover: string;
  type: SongType;
  genre: string;
  addedVersion: number;
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

export interface SongDetails {
  songName: string;
  artist: string;
  cover: string;
  type: SongType;
  genre: string;
  bpm: number | null;
  addedVersion: number;
  userScores?: Record<string, Record<string, UserScore>>;
  regions: {
    region: Region;
    versions: {
      gameVersion: number;
      charts: SongExtended[];
    }[];
  }[];
}

export type UniqueSongFilterType = "type" | "genre" | "addedVersion" | "sort" | "level" | "noteDesigner";

export interface UniqueSongFilter extends GenericFilter {
  type: UniqueSongFilterType;
}

export type GroupMode = "none" | "noteDesigner" | "level_asc" | "level_desc" | "version_asc" | "version_desc" | "genre" | "artist";
