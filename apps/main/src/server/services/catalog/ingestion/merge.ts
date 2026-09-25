import { pendingValue } from "./types";
import type { CatalogFetchContext, CatalogLogger, Pending } from "@/server/services/catalog/ingestion/types";
import type { Fetcher } from "@/server/services/catalog/ingestion/runner";
import { levenshtein } from "@/lib/utils";

export type FetcherMode = "default" | "only-modify" | "only-fallback";
export type MergePolicy<T> = {
  key: (song: T) => string;
  artist: (song: T) => string;
  addedVersion: (song: T) => number | undefined;
  merge: (existing: T, incoming: T, log: CatalogLogger) => T;
};

export function choosePendingValue<T>(existing: Pending<T>, incoming: Pending<T>): Pending<T>;
export function choosePendingValue<T>(existing: Pending<T> | undefined, incoming: Pending<T> | undefined): Pending<T> | undefined;
export function choosePendingValue<T>(existing: Pending<T> | undefined, incoming: Pending<T> | undefined): Pending<T> | undefined {
  const important = (value: Pending<T> | undefined) => value !== null && typeof value === "object" && "important" in value && value.important;
  if (important(incoming)) return incoming;
  if (important(existing)) return existing;
  return !pendingValue(incoming) ? existing : incoming;
}

export function asFetcher<T extends object, C extends CatalogFetchContext>(source: (context: C) => Promise<T[]>, policy: MergePolicy<T>, mode: FetcherMode = "default"): Fetcher<T, C> {
  return async (context, songs) => {
    const fetched = await source(context);
    const merged = mergeSongs(songs, fetched, context.forceMode || mode, context.log, policy);
    context.log.debug({ songCount: merged.length }, "Merged source charts");
    return merged;
  };
}

export function mergeSongs<T extends object>(
  firstSongs: T[],
  secondSongs: T[],
  mode: FetcherMode,
  childLog: CatalogLogger,
  policy: MergePolicy<T>,
  sink?: { onMerge?: (existing: T, incoming: T, result: T) => void; onAdd?: (song: T, isFirst: boolean) => void }
) {
  const { key } = policy;
  const merger = (a: T, b: T) => policy.merge(a, b, childLog);
  type Entry = { id: number; artist: string; addedVersion: string; first: boolean };

  let nextId = 0;
  const songById = new Map<number, T>();
  const idToEntries: Record<string, Entry[]> = {};

  const versionStr = (v: number | undefined): string => {
    const val = v;
    return val !== undefined && val !== null ? String(val) : "";
  };

  const addEntry = (songKey: string, artist: string, addedVersion: string, isFirst: boolean, song: T): number => {
    const id = nextId++;
    songById.set(id, song);
    if (!idToEntries[songKey]) idToEntries[songKey] = [];
    idToEntries[songKey].push({ id, artist, addedVersion, first: isFirst });
    return id;
  };

  const removeEntry = (songKey: string, entryId: number) => {
    const entries = idToEntries[songKey];
    if (!entries) return;
    const idx = entries.findIndex(e => e.id === entryId);
    if (idx !== -1) entries.splice(idx, 1);
    songById.delete(entryId);
  };

  const mergeEntry = (targetEntry: Entry, songKey: string, song: T, isFirst: boolean) => {
    const existingSong = songById.get(targetEntry.id)!;
    const mergedSong = merger(existingSong, song);

    const newArtist = policy.artist(mergedSong) || "";
    const newAddedVersion = versionStr(policy.addedVersion(mergedSong));

    removeEntry(songKey, targetEntry.id);
    addEntry(songKey, newArtist, newAddedVersion, isFirst, mergedSong);
    sink?.onMerge?.(existingSong, song, mergedSong);
  };

  const processSong = (song: T, first: boolean) => {
    const songKey: string = key(song);
    const currentArtist = policy.artist(song) || "";
    const currentAddedVersion = versionStr(policy.addedVersion(song));
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
    const aVer = versionStr(policy.addedVersion(a));
    const bVer = versionStr(policy.addedVersion(b));
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
