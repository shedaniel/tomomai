import type { VersionId } from "@/lib/metadata";
import type { Difficulty, Level, NoteCounts, Region, SongType } from "@/lib/types";
import type { Pending, NoticeSink } from "../ingestion/types";
import type { Logger as PinoLogger } from "pino";
import type { Fetcher, Attributed, FetchingContextExtended as SharedFetchingContextExtended } from "../ingestion/runner";
import type { FetcherMode } from "../ingestion/merge";

export type PendingSong = {
  songName: string;
  type: SongType;
  difficulty: Difficulty;
  songKana?: Pending<string>;
  artist?: Pending<string>;
  cover?: Pending<string>;
  level: Pending<Level>;
  levelPrecise?: Pending<number>;
  genre?: Pending<string>;
  addedVersion?: Pending<VersionId>;
  bpm?: Pending<number>;
  noteDesigner?: Pending<string>;
  noteCounts?: Pending<NoteCounts>;
  metadata?: Record<string, unknown>;
  extras?: Record<string, string | number | boolean>;
}

export type SongKey = `${string}@${SongType}@${Difficulty}`;
export type FetchingContext = {
  region: Region;
  version: VersionId;
  cookies: string;
  log: PinoLogger;
  forceMode?: FetcherMode;
  notice: NoticeSink;
};
export type SongFetcher = Fetcher<PendingSong, FetchingContext>;
export type SongWithOrigin = Attributed<PendingSong>;
export type SongWithMode = PendingSong & { mode: FetcherMode | undefined } | PendingSong


export type FetchingContextExtended = SharedFetchingContextExtended<PendingSong, FetchingContext>;


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
  metadata?: Record<string, unknown>;
}

type ParsedSong = {
  songName: string;
  level: Level;
  musicType: SongType;
  difficulty: Difficulty;
  inputValue: string;
  inputName: string;
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
