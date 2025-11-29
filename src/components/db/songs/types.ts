import { GenericFilter } from "@/components/filter-panel";
import { Region, SongExtended, SongType } from "@/lib/types";

export interface UniqueSong {
  songName: string;
  artist: string;
  cover: string;
  type: "std" | "dx";
  genre: string;
  addedVersion: number;
  slug: string;
  aliases: string[];
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

export type UniqueSongFilterType = "type" | "genre" | "addedVersion";

export interface UniqueSongFilter extends GenericFilter {
  type: UniqueSongFilterType;
}
