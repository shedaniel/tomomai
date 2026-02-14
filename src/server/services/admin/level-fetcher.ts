import { VersionId } from "@/lib/metadata";
import { Difficulty, Region, SongType } from "@/lib/types";
import { UpdateSong } from "@/lib/types/update";
import { PendingSong, value } from "@/server/utils/admin/type";
import { type Logger } from "pino";
import { DxDataFetcher } from "./dxrating";
import { FallbackFetcher } from "./fallback";
import { MaimaiAfterFetcher } from "./maimai-after-fetch";
import { MaimaiBaseFetcher } from "./maimai-base-songs";
import { MaimaiScraperFetcher } from "./maimai-scraper";
import { OtogeDbFetcher } from "./otoge-db";
import deepEqual from "deep-equal";
import { normalizeGenre, normalizeName } from "@/lib/name-utils";
import { isNullOrUndefined } from "@/lib/utils";
import { FillLevelPreciseFetcher } from "./fill-level";
import { key } from "./fetcher-utils";

type SongKey = `${string}@${SongType}@${Difficulty}`;
type FetcherMode = "default" | "only-modify" | "only-fallback";
export type FetchingContext = {
  region: Region;
  version: VersionId;
  cookies: string;
  log: Logger;
};
type FetchingContextExtended = FetchingContext & {
  previous: SongFetcher | null,
  current: SongFetcher,
  fetcherIndex: number,
};
export type SongWithOrigin = PendingSong & { addedFetcher: number; modifiedFetchers: number[] };
export type SongWithMode = PendingSong & { mode: FetcherMode | undefined } | PendingSong
export type SongFetcher = (context: FetchingContextExtended, songs: PendingSong[]) => Promise<PendingSong[]>;

export const SorterFetcher: SongFetcher = async (context, songs) => {
  context.log.debug("Sorting songs...");
  return songs.sort((a, b) => a.songName.localeCompare(b.songName) * 10000000 + value(a.artist || "").localeCompare(value(b.artist || "")) * 100000 + a.difficulty.localeCompare(b.difficulty) * 1000 + a.type.localeCompare(b.type));
}

const FETCHERS: SongFetcher[] = [
  // Scrapes official maimaidx net for songs
  MaimaiScraperFetcher,
  // Fetches official maimai songs json for cover, genre, artist
  MaimaiBaseFetcher,
  // Fetches dxdata songs for precise level, bpm, chart designer, notes
  DxDataFetcher,
  // Fetches official maimaidx net details for missing cover, genre, artist
  MaimaiAfterFetcher,
  // Fetches ./data/extra
  FallbackFetcher,
  // Fetches otoge-db
  OtogeDbFetcher,
  // Fill level precise
  FillLevelPreciseFetcher,
  // Sorts the levels
  SorterFetcher,
]

function validateSongs(songsInput: SongWithOrigin[], log: Logger): void {
  for (const song of songsInput) {
    // validate non-null
    if (isNullOrUndefined(song.songName) || isNullOrUndefined(song.type) || isNullOrUndefined(song.difficulty)) {
      log.error({ song }, "Song name, type, or difficulty is missing");
    }
    if (isNullOrUndefined(song.level) || isNullOrUndefined(value(song.level))) {
      log.error({ song }, "Level is missing");
    }

    // validate normalization
    if (song.songName !== normalizeName(song.songName)) {
      log.error({ song }, "Song name does not match normalized name");
    }
    if (!!value(song.genre) && value(song.genre) !== normalizeGenre(value(song.genre)!)) {
      log.error({ song }, "Genre does not match normalized genre");
    }
  }

  let songs = songsInput.map(song => ({
    ...song,
    key: key(song),
    normalizedKey: `${song.songName.trim()}@${song.type}@${song.difficulty}`,
  }));
  const addedKeys = new Set<string>();
  const addedNormalizedKeys = new Set<string>();
  for (const song of songs) {
    if (addedKeys.has(song.key)) {
      const duplicates = songs.filter(s => s.key === song.key);
      log.warn({ songs: duplicates }, "Duplicate song key");
      songs = songs.filter(s => s.key !== song.key);
    }
    if (addedNormalizedKeys.has(song.normalizedKey)) {
      const duplicates = songs.filter(s => s.normalizedKey === song.normalizedKey);
      log.warn({ songs: duplicates }, "Duplicate song normalized key");
      songs = songs.filter(s => s.normalizedKey !== song.normalizedKey);
    }
    addedKeys.add(song.key);
    addedNormalizedKeys.add(song.normalizedKey);
  }
}

function attributeSource(prevSongs: SongWithOrigin[], newSongs: PendingSong[], fetcherIndex: number): SongWithOrigin[] {
  // Compare the songs, if new song entry, set addedFetcher, otherwise compare if modified, if yes, set modifiedFetcher
  return newSongs.map(newSong => {
    const existingSong = prevSongs.find(s => key(s) === key(newSong));
    if (!existingSong) {
      return { ...newSong, addedFetcher: fetcherIndex, modifiedFetchers: [fetcherIndex] } satisfies SongWithOrigin;
    }
    if (!deepEqual(existingSong, newSong)) {
      return { ...newSong, addedFetcher: existingSong.addedFetcher, modifiedFetchers: [...existingSong.modifiedFetchers, fetcherIndex] } satisfies SongWithOrigin;
    }
    return existingSong;
  });
}

export async function fetchLevels(context: FetchingContext): Promise<UpdateSong[]> {
  context.log.info(
    { region: context.region, version: context.version },
    "Starting level fetch pipeline"
  );

  let songs: SongWithOrigin[] = []
  let previous: SongFetcher | null = null;
  let index = 0;
  for (const fetcher of FETCHERS) {
    const logger = context.log.child({ fetcherIndex: index });
    const extendedContext = {
      ...context,
      log: logger,
      previous: previous,
      current: fetcher,
      fetcherIndex: index,
    };
    extendedContext.log.info("Fetcher starting...");
    const newSongs = await fetcher(extendedContext, songs);
    songs = attributeSource(songs, newSongs, index)
    previous = fetcher;
    index++;
    validateSongs(songs, extendedContext.log);
  }

  context.log.info(
    { totalSongs: songs.length },
    "Fetch pipeline completed successfully"
  );

  function nonnull<T>(value: T | null | undefined, fieldName: string, song: PendingSong): T {
    if (value === null || value === undefined) {
      const errorMsg = `Value is null or undefined for ${fieldName}`;
      context.log.error({ error: errorMsg, song }, errorMsg);
      throw new Error(errorMsg);
    }
    return value;
  }

  const updateSongs: UpdateSong[] = []
  const errors: any[] = []
  for (const song of songs) {
    try {
      const updatedSong = {
        songName: value(song.songName),
        artist: nonnull(value(song.artist), "artist", song),
        difficulty: value(song.difficulty),
        type: value(song.type),
        level: value(song.level),
        levelPrecise: nonnull(value(song.levelPrecise), "levelPrecise", song),
        cover: nonnull(value(song.cover), "cover", song),
        genre: nonnull(value(song.genre), "genre", song),
        addedVersion: nonnull(value(song.addedVersion), "addedVersion", song),
        bpm: value(song.bpm) || null,
        noteDesigner: value(song.noteDesigner) || null,
        noteCounts: value(song.noteCounts) || null,
      } satisfies UpdateSong;
      updateSongs.push(updatedSong);
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length > 0) {
    context.log.error({ errors, songs }, "Errors occurred during song update");
    throw new Error("Errors occurred during song update");
  }
  return updateSongs;
}
