// Catalog-facing type definitions shared between the main app and the data service
import { VersionId } from "./metadata";

export type Region = "intl" | "jp" | "cn";

export type Difficulty = "basic" | "advanced" | "expert" | "master" | "remaster" | "utage";

export type Level =
  | "1" | "1+" | "2" | "2+" | "3" | "3+" | "4" | "4+" | "5" | "5+"
  | "6" | "6+" | "7" | "7+" | "8" | "8+" | "9" | "9+" | "10" | "10+"
  | "11" | "11+" | "12" | "12+" | "13" | "13+" | "14" | "14+" | "15" | "15+"
  | "16" | "16+";

export type SongType = "std" | "dx";

// Song data with score information
export type MinimalSong = {
  songId: string;
  songName: string;
  artist: string;
  cover: string;
  type: SongType;
  difficulty: Difficulty;
}

export type SongBase = MinimalSong & {
  level: string;
  levelPrecise: number;
  genre: string;
  addedVersion: VersionId;
}

export type SongExtended = SongBase & {
  bpm: number | null;
  noteDesigner: string | null;
  tapCount: number | null;
  holdCount: number | null;
  slideCount: number | null;
  touchCount: number | null;
  breakCount: number | null;
};

export interface NoteCounts {
  tap: number;
  hold: number;
  slide: number;
  touch: number;
  break: number;
}
