import { GenericFilter } from "@/components/filter-panel";

export interface UniqueSong {
  songName: string;
  artist: string;
  cover: string;
  type: "std" | "dx";
  genre: string;
  addedVersion: number;
  slug: string;
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
  type: "std" | "dx";
  genre: string;
  bpm: number | null;
  addedVersion: number;
  userScores?: Record<string, Record<string, UserScore>>;
  regions: {
    region: string;
    versions: {
      gameVersion: number;
      charts: {
        id: string;
        songName: string;
        artist: string;
        cover: string;
        difficulty: string;
        level: string;
        levelPrecise: number;
        type: "std" | "dx";
        genre: string;
        region: string;
        gameVersion: number;
        addedVersion: number;
        bpm: number | null;
        noteDesigner: string | null;
        tapCount: number | null;
        holdCount: number | null;
        slideCount: number | null;
        touchCount: number | null;
        breakCount: number | null;
      }[];
    }[];
  }[];
}

export type UniqueSongFilterType = "type" | "genre" | "addedVersion";

export interface UniqueSongFilter extends GenericFilter {
  type: UniqueSongFilterType;
}

