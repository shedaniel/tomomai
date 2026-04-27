import { Difficulty, FullCombo, FullSync, SongType, TitleType } from "../types";

export interface PlayerData {
  iconUrl: string;
  iconBase64: string;
  displayName: string;
  rating: number;
  title: string;
  titleType: TitleType;
  stars: number;
  versionPlayCount: number;
  totalPlayCount: number;
  courseRankUrl: string;
  classRankUrl: string;
}

export interface ScoreData {
  songName: string;
  level: string;
  musicType: SongType;
  difficulty: Difficulty;
  difficultyNumber: number;
  achievement: number; // stored as 10000x
  dxScore: number;
  fc: FullCombo;
  fs: FullSync;
}

export interface RecentSongData {
  songName: string;
  level: string;
  musicType: SongType;
  difficulty: string;
  difficultyNumber: number;
  achievement: number; // stored as 10000x
  dxScore: number;
  maxDxScore: number;
  fc: FullCombo;
  fs: FullSync;
  track: number;
  playedAt: Date;
  idx: string; // Form data for playlog detail page
}

export interface AlbumData {
  songName: string;
  musicType: SongType;
  difficulty: Difficulty;
  takenAt: Date;
  imageUrl: string;
  venue: string | null;
}

export interface EventData {
  name: string;
  currentDistance: number;
  nextRewardDistance: number | null;
  state: "not_started" | "in_progress" | "completed";
  imageUrl: string;
}

export interface EventAreaData extends EventData {
  eventPeriod: [number, number] | null; // [startTimestamp, endTimestamp]
}
