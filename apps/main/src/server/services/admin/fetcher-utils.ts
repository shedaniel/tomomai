import { VersionId } from "@/lib/metadata";
import { Difficulty, Region, SongType } from "@/lib/types";
import { isImportant, Pending, PendingSong, unwrapUndefined, value } from "@/server/utils/admin/type";
import { type Logger } from "pino";
import { levenshtein } from "@/lib/utils";
import { FetchingContextExtended } from "./level-fetcher";
import deepEqual from "deep-equal";

export type SongKey = `${string}@${SongType}@${Difficulty}`;
export type FetcherMode = "default" | "only-modify" | "only-fallback";
export type NoticeSink = {
  addDetail(detail: string): void;
  details: string[];
};

export function createNoticeSink(): NoticeSink {
  const details: string[] = [];
  return {
    addDetail(detail: string) { details.push(detail); },
    details,
  };
}

export type FetchingContext = {
  region: Region;
  version: VersionId;
  cookies: string;
  log: Logger;
  forceMode?: FetcherMode;
  notice: NoticeSink;
};
export type SongFetcher = (context: FetchingContextExtended, songs: PendingSong[]) => Promise<PendingSong[]>;
export type SongWithOrigin = PendingSong & { addedFetcher: number; modifiedFetchers: number[] };
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
  return async (context, songs) => {
    const childLog = context.log.child({ mode });
    const fetched = await promise(context);
    const take = taker(childLog)
    const merged = mergeSongs(songs, fetched, context.forceMode || mode, childLog, merger(childLog, take), take);
    childLog.debug(`Merged ${songs.length} songs with ${fetched.length} songs into ${merged.length} songs`);
    return merged;
  };
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

    return bv;
  } else if (bImportant) {
    if (!deepEqual(aValue, bValue) && !!aValue) {
      log.debug(
        { fieldName, aValue, bValue, a, b, song: key(a) },
        `Data mismatch: important field from B '${fieldName}' has conflicting values`
      );
    }

    return bv;
  } else if (aImportant) {
    if (!deepEqual(aValue, bValue) && !!bValue) {
      log.debug(
        { fieldName, aValue, bValue, a, b, song: key(a) },
        `Data mismatch: important field from A '${fieldName}' has conflicting values`
      );
    }

    return av;
  } else {
    return !bValue ? av : bv;
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
  firstSongs: SongWithMode[],
  secondSongs: SongWithMode[],
  mode: FetcherMode,
  childLog: Logger,
  merger: (first: SongWithMode, second: SongWithMode) => SongWithMode,
  take: Taker<any>,
  sink?: MergeSink
) {
  type Entry = { id: number; artist: string; addedVersion: string; first: boolean };

  let nextId = 0;
  const songById = new Map<number, SongWithMode>();
  const idToEntries: Record<SongKey, Entry[]> = {};

  const versionStr = (v: Pending<VersionId> | undefined): string => {
    const val = value(v);
    return val !== undefined && val !== null ? String(val) : "";
  };

  const addEntry = (songKey: SongKey, artist: string, addedVersion: string, isFirst: boolean, song: SongWithMode): number => {
    const id = nextId++;
    songById.set(id, song);
    if (!idToEntries[songKey]) idToEntries[songKey] = [];
    idToEntries[songKey].push({ id, artist, addedVersion, first: isFirst });
    return id;
  };

  const removeEntry = (songKey: SongKey, entryId: number) => {
    const entries = idToEntries[songKey];
    if (!entries) return;
    const idx = entries.findIndex(e => e.id === entryId);
    if (idx !== -1) entries.splice(idx, 1);
    songById.delete(entryId);
  };

  const mergeEntry = (targetEntry: Entry, songKey: SongKey, song: SongWithMode, isFirst: boolean) => {
    const existingSong = songById.get(targetEntry.id)!;
    const mergedSong = merger(existingSong, song);

    const newArtist = value(take(existingSong, song, existingSong.artist, song.artist, "artist")) || "";
    const newAddedVersion = versionStr(take(existingSong, song, existingSong.addedVersion, song.addedVersion, "addedVersion"));

    removeEntry(songKey, targetEntry.id);
    addEntry(songKey, newArtist, newAddedVersion, isFirst, mergedSong);
    sink?.onMerge?.(existingSong, song, mergedSong);
  };

  const processSong = (song: SongWithMode, first: boolean) => {
    const songKey: SongKey = key(song);
    const currentArtist = value(song.artist) || "";
    const currentAddedVersion = versionStr(song.addedVersion);
    const songMode = "mode" in song && song.mode || mode;

    let target: Entry | null = null;
    const candidates = idToEntries[songKey] || [];

    // Phase 1: Find target entry
    if (first) {
      // Local Source: Strict Matching
      // Only merge if there is an EXACT artist AND addedVersion match (duplicate record in same source)
      // undefined addedVersion acts as a wildcard
      const exactMatch = candidates.find(c =>
        c.artist === currentArtist &&
        (c.addedVersion === currentAddedVersion || !c.addedVersion || !currentAddedVersion)
      );
      if (exactMatch) target = exactMatch;
    } else {
      // Fetched Source: Fuzzy Matching (No Threshold)
      // Find the "closest" match among existing entries
      // Strategy: prefer version-matching candidates, fall back to all candidates
      const findBest = (pool: Entry[]): Entry | null => {
        let best: Entry | null = null;
        let minDist = Infinity;
        for (const candidate of pool) {
          if (candidate.artist === currentArtist) {
            return candidate; // Exact artist match, distance 0
          }
          const dist = levenshtein(candidate.artist, currentArtist);
          if (dist < minDist) {
            minDist = dist;
            best = candidate;
          }
        }
        return best;
      };

      // Try candidates with matching addedVersion first (undefined is wildcard only when one side is defined)
      const versionMatched = candidates.filter(c =>
        (c.addedVersion === currentAddedVersion && (!!c.addedVersion || !!currentAddedVersion)) ||
        (!c.addedVersion && !!currentAddedVersion) ||
        (!!c.addedVersion && !currentAddedVersion)
      );
      let bestCandidate = findBest(versionMatched);

      // If no version-matching candidate, fall back to candidates from firstSongs (closest sibling)
      // Only cross-source matches are allowed when versions differ
      if (!bestCandidate && candidates.length > 0) {
        const firstSourceCandidates = candidates.filter(c => c.first);
        if (firstSourceCandidates.length > 0) {
          bestCandidate = findBest(firstSourceCandidates);
        }
      }

      if (bestCandidate) target = bestCandidate;
    }

    // Phase 2: Execute mode logic
    if (songMode === "default") {
      if (!target) {
        addEntry(songKey, currentArtist, currentAddedVersion, first, song);
        sink?.onAdd?.(song, first);
      } else {
        mergeEntry(target, songKey, song, first);
      }
    }
    else if (songMode === "only-fallback") {
      if (first) {
        if (target) removeEntry(songKey, target.id);
        addEntry(songKey, currentArtist, currentAddedVersion, first, song);
      } else if (!target) {
        addEntry(songKey, currentArtist, currentAddedVersion, first, song);
        sink?.onAdd?.(song, first);
      }
    }
    else if (songMode === "only-modify") {
      if (first) {
        if (target) removeEntry(songKey, target.id);
        addEntry(songKey, currentArtist, currentAddedVersion, first, song);
      } else if (target) {
        mergeEntry(target, songKey, song, first);
      }
    }
    else {
      childLog.error(`Unknown mode ${songMode} for song ${songKey}`);
    }
  };

  // Pass 1: process firstSongs to populate idToEntries
  for (const song of firstSongs) processSong(song, true);

  // Sort secondSongs so that version-matching songs (matching an existing first-source entry)
  // are processed before non-matching ones. This prevents a non-matching song from consuming
  // a first-source entry via the fallback path before the matching song can claim it.
  const sortedSecondSongs = [...secondSongs].sort((a, b) => {
    const aKey = key(a);
    const bKey = key(b);
    const aVer = versionStr(a.addedVersion);
    const bVer = versionStr(b.addedVersion);
    const aCandidates = idToEntries[aKey] || [];
    const bCandidates = idToEntries[bKey] || [];
    const aMatches = aCandidates.some(c => c.addedVersion === aVer && (!!c.addedVersion || !!aVer)) ? 0 : 1;
    const bMatches = bCandidates.some(c => c.addedVersion === bVer && (!!c.addedVersion || !!bVer)) ? 0 : 1;
    return aMatches - bMatches;
  });

  // Pass 2: process secondSongs in sorted order
  for (const song of sortedSecondSongs) processSong(song, false);

  return [...songById.values()];
}
