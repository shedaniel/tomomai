import { Difficulty, NoteCounts, SongType } from "../types";

type Response = {
  songs: Song[];
}

type Song = {
  songId: string;
  category: string;
  title: string;
  artist: string;
  bpm: number | null;
  imageName: string;
  isNew: boolean;
  isLocked: boolean;
  sheets: Sheet[];
}

type Sheet = {
  type: SongType | "utage";
  difficulty: Difficulty;
  level: string;
  internalLevelValue: number;
  noteDesigner: string | "-";
  noteCounts: {
    tap: number,
    hold: number,
    slide: number,
    touch: number | null,
    break: number,
    total: number,
  };
  isSpecial: boolean;
  version: string;
  releaseDate: string;
  multiverInternalLevelValue?: Record<string, number>;
  regionOverrides?: Record<string, Partial<Sheet>>;
}

export type {
  Response as DxRatingResponse,
  Song as DxRatingSong,
  Sheet as DxRatingSheet,
}
