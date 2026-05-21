import { UpdateSong } from "@/lib/types/update";
import { PendingSong, value } from "@/server/utils/admin/type";
import { type Logger } from "pino";
import { DxDataFetcher } from "./dxrating";
import { FallbackFetcher } from "./fallback";
import { MaimaiAfterFetcher } from "./maimai-after-fetch";
import { MaimaiBaseFetcher } from "./maimai-base-songs";
import { MaimaiScraperFetcher } from "./maimai-scraper";
import { OtogeDbFetcher } from "./otoge-db";
import { LxnsFetcher } from "./maimai-lxns";
import { Region } from "@/lib/types";
import deepEqual from "deep-equal";
import { normalizeGenre, normalizeName } from "@/lib/name-utils";
import { isNullOrUndefined } from "@/lib/utils";
import { FillLevelPreciseFetcher } from "./fill-level";
import { createNoticeSink, FetchingContext, key, SongFetcher, SongWithOrigin } from "./fetcher-utils";
import { sendDiscordNotice } from "./discord-webhooks";

export type FetchingContextExtended = FetchingContext & {
  previous: SongFetcher | null,
  current: SongFetcher,
  fetcherIndex: number,
};

export const SorterFetcher: SongFetcher = async (context, songs) => {
  context.log.debug("Sorting songs...");
  return songs.sort((a, b) => a.songName.localeCompare(b.songName) * 10000000 + value(a.artist || "").localeCompare(value(b.artist || "")) * 100000 + a.difficulty.localeCompare(b.difficulty) * 1000 + a.type.localeCompare(b.type));
}

export const FETCHERS: SongFetcher[] = [
  // Scrapes official maimaidx net for songs
  MaimaiScraperFetcher,
  // Fetches official maimai songs json for cover, genre, artist
  MaimaiBaseFetcher,
  // Fetches dxdata songs for precise level, bpm, chart designer, notes
  DxDataFetcher,
  // Fetches ./data/extra
  FallbackFetcher,
  // Fetches otoge-db
  OtogeDbFetcher,
  // Fetches official maimaidx net details for missing cover, genre, artist
  MaimaiAfterFetcher,
  // Fill level precise
  FillLevelPreciseFetcher,
  // Sorts the levels
  SorterFetcher,
]

export const FETCHER_NAMES: string[] = [
  "Maimai Scraper",
  "Maimai Base Songs",
  "DxData",
  "Fallback",
  "OtogeDB",
  "Maimai After Fetch",
  "Fill Level Precise",
  "Sorter",
]

export const CN_FETCHERS: SongFetcher[] = [
  LxnsFetcher,
  FillLevelPreciseFetcher,
  SorterFetcher,
]

export const CN_FETCHER_NAMES: string[] = [
  "Lxns",
  "Fill Level Precise",
  "Sorter",
]

export function getFetchersForRegion(region: Region): { fetchers: SongFetcher[]; names: string[] } {
  if (region === "cn") return { fetchers: CN_FETCHERS, names: CN_FETCHER_NAMES };
  return { fetchers: FETCHERS, names: FETCHER_NAMES };
}

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

function summarizeStage(songs: SongWithOrigin[], fetcherIndex: number, fetcherName: string, songsBefore: number, elapsed: number, notice: { details: string[] }): { summary: string; noticeBody: string } {
  const addedSongs = songs.filter(s => s.addedFetcher === fetcherIndex);
  const modifiedSongs = songs.filter(s => s.addedFetcher !== fetcherIndex && s.modifiedFetchers.includes(fetcherIndex));
  const netChange = songs.length - songsBefore;

  const header = `**${fetcherName}**: ${songs.length} songs (${netChange >= 0 ? "+" : ""}${netChange}) — ${elapsed}ms`;
  const changeLine = `+${addedSongs.length} added, ~${modifiedSongs.length} modified`;

  const lines: string[] = [changeLine];
  if (addedSongs.length > 0 && addedSongs.length < 30) {
    lines.push("Added: " + addedSongs.map(s => key(s)).join(", "));
  }
  if (modifiedSongs.length > 0 && modifiedSongs.length < 30) {
    lines.push("Modified: " + modifiedSongs.map(s => key(s)).join(", "));
  }
  lines.push(...notice.details);

  const detailBlock = lines.join("\n");
  return {
    summary: `${header}\n${changeLine}${notice.details.length > 0 ? "\n" + notice.details.join("\n") : ""}`,
    noticeBody: `${header}\n${detailBlock}`,
  };
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

  const { fetchers, names } = getFetchersForRegion(context.region);

  let songs: SongWithOrigin[] = []
  let previous: SongFetcher | null = null;
  let index = 0;
  const stageResults: string[] = [];
  for (const fetcher of fetchers) {
    const fetcherName = names[index] ?? `Fetcher ${index}`;
    const logger = context.log.child({ fetcherIndex: index });
    const notice = createNoticeSink();
    const extendedContext = {
      ...context,
      log: logger,
      notice,
      previous: previous,
      current: fetcher,
      fetcherIndex: index,
    };
    extendedContext.log.info("Fetcher starting...");
    const songsBefore = songs.length;
    const startTime = Date.now();
    const newSongs = await fetcher(extendedContext, songs);
    const elapsed = Date.now() - startTime;
    songs = attributeSource(songs, newSongs, index)
    const stage = summarizeStage(songs, index, fetcherName, songsBefore, elapsed, notice);
    stageResults.push(stage.summary);

    sendDiscordNotice(
      context.region,
      `Stage ${index + 1}/${fetchers.length}: ${fetcherName}`,
      stage.noticeBody,
      0x5865F2,
    ).catch(() => { });

    previous = fetcher;
    index++;
    validateSongs(songs, extendedContext.log);
  }

  context.log.info(
    { totalSongs: songs.length },
    "Fetch pipeline completed successfully"
  );

  {
    sendDiscordNotice(
      context.region,
      "Fetch pipeline completed",
      `**Total songs: ${songs.length}** (${fetchers.length} stages)`,
      0x00FF00,
    ).catch(() => { });
  }

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
