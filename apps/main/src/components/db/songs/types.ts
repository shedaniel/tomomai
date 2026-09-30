import { GenericFilter } from "@/components/filter-panel";
import type { CodeKey } from "@/lib/games/codes";
import type { CanonicalGameId } from "@/lib/games/ids";
import { Region } from "@/lib/types";

export type ChartTypeKey = CodeKey<CanonicalGameId, "chartType">;
export type DifficultyKey = CodeKey<CanonicalGameId, "difficulty">;

export interface UniqueSong {
  parentIds: string[];
  index: number;
  songName: string;
  artist: string;
  cover: string;
  type: ChartTypeKey;
  genre: string;
  addedVersion: number;
  slug: string;
  aliases: string[];
  difficulties: UniqueSongDifficulty[];
}

export interface UniqueSongDifficulty {
  difficulty: DifficultyKey;
  level: string;
  levelPrecise: number;
  levelPreciseEstimated?: boolean;
  noteDesigner: string | null;
}

export interface UserScore {
  scoreValue: number;
  comboStatus: number;
  syncStatus: number;
  clearStatus: number;
}

export interface SongDetailHistoricalChart {
  difficulty: DifficultyKey;
  levelPrecise: number;
  levelPreciseEstimated?: boolean;
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

export type SongExtendedIdentified = SongDetailChart & { region: Region; gameVersion: number };

export interface SongDetails {
  parentIds: string[];
  songName: string;
  artist: string;
  cover: string;
  type: ChartTypeKey;
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
