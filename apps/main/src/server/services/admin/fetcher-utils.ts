import { VersionId } from "@/lib/metadata";
import { Difficulty, Region, SongType } from "@/lib/types";
import { isImportant, Pending, PendingSong, unwrapUndefined, value } from "@/server/utils/admin/type";
import type { Logger as PinoLogger } from "pino";
import type { CatalogLogger as Logger } from "@/lib/games/catalog-types";
import { asFetcher as sourceFetcher, mergeSongs as mergeSourceSongs, choosePendingValue } from "../games/catalog-merge";
import type { Fetcher, Attributed } from "../games/catalog-fetcher";
import type { FetcherMode } from "../games/catalog-merge";
import type { NoticeSink } from "@/lib/games/catalog-types";
export { createNoticeSink } from "../games/catalog-fetcher";
export type { FetcherMode } from "../games/catalog-merge";
export type { NoticeSink } from "@/lib/games/catalog-types";
import deepEqual from "deep-equal";

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

type Taker<T> = (a: PendingSong, b: PendingSong, av: Pending<T>, bv: Pending<T>, fieldName: string) => Pending<T>;

export function key(song: PendingSong): SongKey;
export function key(song: null | undefined): null;
export function key(song: PendingSong | null | undefined): SongKey | null;
export function key(song: PendingSong | null | undefined): SongKey | null {
  if (!song) {
    return null;
  }
  return `${song.songName}@${song.type}@${song.difficulty}`;
}

export function asFetcher(promise: (context: FetchingContext) => Promise<SongWithMode[]>, mode: FetcherMode = "default"): SongFetcher {
  return sourceFetcher(promise, {
    key, artist: song => value(song.artist) || "", addedVersion: song => value(song.addedVersion),
    merge: (a, b, log) => merger(log, taker(log))(a, b),
  }, mode);
}

export const taker: <T>(log: Logger) => Taker<T> = (log: Logger) => <T>(a: PendingSong, b: PendingSong, av: Pending<T>, bv: Pending<T>, fieldName: string): Pending<T> => {
  const aImportant = isImportant(av), bImportant = isImportant(bv);
  const aValue = value(av), bValue = value(bv);
  if (aImportant && bImportant) {
    if (!deepEqual(aValue, bValue)) {
      log.warn(
        { fieldName, aValue, bValue, a, b, song: key(a) },
        `Data mismatch: important field '${fieldName}' has conflicting values`
      );
    }

    return choosePendingValue(av, bv);
  } else if (bImportant) {
    if (!deepEqual(aValue, bValue) && !!aValue) {
      log.debug(
        { fieldName, aValue, bValue, a, b, song: key(a) },
        `Data mismatch: important field from B '${fieldName}' has conflicting values`
      );
    }

    return choosePendingValue(av, bv);
  } else if (aImportant) {
    if (!deepEqual(aValue, bValue) && !!bValue) {
      log.debug(
        { fieldName, aValue, bValue, a, b, song: key(a) },
        `Data mismatch: important field from A '${fieldName}' has conflicting values`
      );
    }

    return choosePendingValue(av, bv);
  } else {
    return choosePendingValue(av, bv);
  }
};

export const merger = (log: Logger, taker: Taker<any>) => (a: PendingSong, b: PendingSong) => {
  if (!a || !b) {
    const errorMsg = `Unexpected null value for ${key(a) || key(b)}`;
    log.error({ songA: a, songB: b }, errorMsg);
    throw new Error(errorMsg);
  }

  if (a.songName !== b.songName || a.type !== b.type || a.difficulty !== b.difficulty) {
    const errorMsg = `Critical mismatch during merge: ${key(a)} vs ${key(b)}`;
    log.error({ songA: key(a), songB: key(b) }, errorMsg);
    throw new Error(errorMsg);
  }

  return {
    songName: a.songName,
    type: a.type,
    difficulty: a.difficulty,
    artist: unwrapUndefined(taker(a, b, a.artist, b.artist, "artist")),
    cover: unwrapUndefined(taker(a, b, a.cover, b.cover, "cover")),
    level: taker(a, b, a.level, b.level, "level"),
    levelPrecise: unwrapUndefined(taker(a, b, a.levelPrecise, b.levelPrecise, "levelPrecise")),
    genre: unwrapUndefined(taker(a, b, a.genre, b.genre, "genre")),
    addedVersion: unwrapUndefined(taker(a, b, a.addedVersion, b.addedVersion, "addedVersion")),
    bpm: unwrapUndefined(taker(a, b, a.bpm, b.bpm, "bpm")),
    noteDesigner: unwrapUndefined(taker(a, b, a.noteDesigner, b.noteDesigner, "noteDesigner")),
    noteCounts: unwrapUndefined(taker(a, b, a.noteCounts, b.noteCounts, "noteCounts")),
    extras: {
      ...(a.extras || {}),
      ...(b.extras || {})
    }
  } satisfies PendingSong
};

export type MergeSink = {
  onMerge?: (existing: PendingSong, incoming: PendingSong, result: PendingSong) => void;
  onAdd?: (song: PendingSong, isFirst: boolean) => void;
};

export function mergeSongs(
  firstSongs: SongWithMode[], secondSongs: SongWithMode[], mode: FetcherMode,
  childLog: Logger, merge: (first: SongWithMode, second: SongWithMode) => SongWithMode,
  _take: Taker<any>, sink?: MergeSink,
) {
  return mergeSourceSongs(firstSongs, secondSongs, mode, childLog, {
    key, artist: song => value(song.artist) || "", addedVersion: song => value(song.addedVersion),
    merge,
  }, sink);
}
