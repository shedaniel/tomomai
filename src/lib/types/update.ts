import { Difficulty, Level, NoteCounts, SongType } from "../types";

type Song = {
  songName: string;
  artist: string;
  cover: string;
  difficulty: Difficulty;
  level: Level;
  levelPrecise: number;
  type: SongType;
  genre: string;
  addedVersion: number;
  bpm: number | null;
  noteDesigner: string | null;
  noteCounts: NoteCounts | null;
}

type ParsedSong = {
  songName: string;
  level: Level;
  musicType: SongType;
  difficulty: string;
  inputValue: string;
  inputName: string;
  difficultyNumber: number;
  version: number;
  index: number;
}

type OfficialSong = {
  artist: string;
  catcode: string;
  image_url: string;
  release: string;
  lev_bas?: Level;
  lev_adv?: Level;
  lev_exp?: Level;
  lev_mas?: Level;
  lev_remas?: Level;
  lev_utage?: Level;
  dx_lev_bas?: Level;
  dx_lev_adv?: Level;
  dx_lev_exp?: Level;
  dx_lev_mas?: Level;
  dx_lev_remas?: Level;
  dx_lev_utage?: Level;
  sort: string;
  title: string;
  title_kana: string;
  version: string;
}

export type { Song as UpdateSong, ParsedSong, OfficialSong };
