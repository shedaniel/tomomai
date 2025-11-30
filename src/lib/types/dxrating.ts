import { Difficulty, NoteCounts, SongType } from "../types";

type Response = {
  songs: Song[];
}

type Song = {
  songId: string;
  category: string;
  title: string;
  artist: string;
  bpm: number;
  imageName: string;
  isNew: boolean;
  isLocked: boolean;
  sheets: Sheet[];
}

type Sheet = {
  type: SongType;
  difficulty: Difficulty;
  level: string;
  internalLevelValue: number;
  noteDesigner: string | "-";
  noteCounts: NoteCounts;
  isSpecial: boolean;
  version: string;
  releaseDate: string;
  multiverInternalLevelValue?: Record<string, number>;
}

export type {
  Response as DxRatingResponse,
  Song as DxRatingSong,
  Sheet as DxRatingSheet,
}