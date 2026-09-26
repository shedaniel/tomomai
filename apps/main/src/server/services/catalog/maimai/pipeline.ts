import type { VersionId } from "@/lib/metadata";
import type { Logger } from "pino";
import type { CatalogFetchContext } from "../ingestion/types";
import { toCatalogChart } from "./normalize";
import { createSorterFetcher } from "../ingestion/stages";
import { runFetchers, requireCatalogValue } from "../ingestion/runner";
import { UpdateSong } from "@/server/services/catalog/maimai/types";
import type { PendingSong } from "@/server/services/catalog/maimai/types";
import { value } from "@/server/services/catalog/ingestion/types";
import { DxDataFetcher } from "./sources/dxrating";
import { FallbackFetcher } from "./sources/fallback";
import { MaimaiAfterFetcher } from "./sources/after-fetch";
import { MaimaiBaseFetcher } from "./sources/base-songs";
import { MaimaiScraperFetcher } from "./sources/scraper";
import { OtogeDbFetcher } from "./sources/otoge-db";
import { LxnsFetcher } from "./sources/lxns";
import { Region } from "@/lib/types";
import { normalizeGenre, normalizeName } from "@/lib/name-utils";
import { isNullOrUndefined } from "@/lib/utils";
import { FillMissingFetcher } from "./fill-level";
import { key } from "./merge";
import type { FetchingContext, SongFetcher } from "./types";
import { sendDiscordNotice } from "../notifications";


export const SorterFetcher: SongFetcher = createSorterFetcher<PendingSong, FetchingContext>((a, b) =>
  a.songName.localeCompare(b.songName) * 10000000 + value(a.artist || "").localeCompare(value(b.artist || "")) * 100000 + a.difficulty.localeCompare(b.difficulty) * 1000 + a.type.localeCompare(b.type));

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
  // Fill missing data
  FillMissingFetcher,
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
  "Fill Missing",
  "Sorter",
]

export const CN_FETCHERS: SongFetcher[] = [
  LxnsFetcher,
  FillMissingFetcher,
  SorterFetcher,
]

export const CN_FETCHER_NAMES: string[] = [
  "Lxns",
  "Fill Missing",
  "Sorter",
]

function getFetchersForRegion(region: Region): { fetchers: SongFetcher[]; names: string[] } {
  if (region === "cn") return { fetchers: CN_FETCHERS, names: CN_FETCHER_NAMES };
  return { fetchers: FETCHERS, names: FETCHER_NAMES };
}

function validateSongs(songsInput: PendingSong[], log: Logger): void {
  for (const song of songsInput) {
    // validate non-null
    if (isNullOrUndefined(song.songName) || isNullOrUndefined(song.type) || isNullOrUndefined(song.difficulty)) {
      log.error({ songKey: key(song) }, "Song name, type, or difficulty is missing");
    }
    if (isNullOrUndefined(song.level) || isNullOrUndefined(value(song.level))) {
      log.error({ songKey: key(song) }, "Level is missing");
    }

    // validate normalization
    if (song.songName !== normalizeName(song.songName)) {
      log.error({ songKey: key(song) }, "Song name does not match normalized name");
    }
    if (!!value(song.genre) && value(song.genre) !== normalizeGenre(value(song.genre)!)) {
      log.error({ songKey: key(song) }, "Genre does not match normalized genre");
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
      log.warn({ songKeys: duplicates.map(s => s.key) }, "Duplicate song key");
      songs = songs.filter(s => s.key !== song.key);
    }
    if (addedNormalizedKeys.has(song.normalizedKey)) {
      const duplicates = songs.filter(s => s.normalizedKey === song.normalizedKey);
      log.warn({ songKeys: duplicates.map(s => s.normalizedKey) }, "Duplicate song normalized key");
      songs = songs.filter(s => s.normalizedKey !== song.normalizedKey);
    }
    addedKeys.add(song.key);
    addedNormalizedKeys.add(song.normalizedKey);
  }
}

export async function fetchLevels(context: FetchingContext): Promise<UpdateSong[]> {
  const definition = getFetchersForRegion(context.region);
  return runFetchers(context, {
    ...definition,
    key,
    validate: validateSongs,
    notify: (title, body, color) => sendDiscordNotice("maimai", context.region, title, body, color),
    complete(song) {
      const required = <T>(field: string, value: T | undefined) => requireCatalogValue(value, field, key(song), context.log);
      return {
        songName: song.songName,
        artist: required("artist", value(song.artist)),
        difficulty: song.difficulty,
        type: song.type,
        level: value(song.level),
        levelPrecise: required("levelPrecise", value(song.levelPrecise)),
        cover: required("cover", value(song.cover)),
        genre: required("genre", value(song.genre)),
        addedVersion: required("addedVersion", value(song.addedVersion)),
        bpm: value(song.bpm) || null,
        noteDesigner: value(song.noteDesigner) || null,
        noteCounts: value(song.noteCounts) || null,
        metadata: song.metadata,
      };
    },
  });
}

export async function collectCatalog(ctx: CatalogFetchContext) {
  const songs = await fetchLevels({
    region: ctx.region,
    version: ctx.version as VersionId,
    cookies: ctx.cookies ?? "",
    forceMode: ctx.forceMode,
    log: ctx.log,
    notice: ctx.notice,
  });
  return songs.map(toCatalogChart);
}
