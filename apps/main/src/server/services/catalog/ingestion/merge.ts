import deepEqual from "deep-equal";
import type { Logger } from "pino";
import { levenshtein } from "@/lib/utils";
import { catalogChartKey } from "./normalize-charts";
import { isImportant, unwrapUndefined, value, type CatalogFetchContext, type Pending, type SourceChart } from "./types";
import type { CatalogStage } from "./runner";

export type FetcherMode = "default" | "only-modify" | "only-fallback";

function choosePendingValue<T>(existing: Pending<T> | undefined, incoming: Pending<T> | undefined): Pending<T> | undefined {
  if (isImportant(incoming)) return incoming;
  if (isImportant(existing)) return existing;
  return !value(incoming) ? existing : incoming;
}

function mergeChart(existing: SourceChart, incoming: SourceChart, log: Logger): SourceChart {
  const field = <T>(name: string, a: Pending<T> | undefined, b: Pending<T> | undefined) => {
    if (isImportant(a) && isImportant(b) && !deepEqual(value(a), value(b))) {
      log.warn(
        { songKey: catalogChartKey(existing), from: JSON.stringify(value(a)), to: JSON.stringify(value(b)) },
        `Data mismatch: important field '${name}' has conflicting values`,
      );
    }
    return unwrapUndefined(choosePendingValue(a, b));
  };
  return {
    game: existing.game,
    songName: existing.songName,
    chartType: existing.chartType,
    difficulty: existing.difficulty,
    artist: field("artist", existing.artist, incoming.artist),
    cover: field("cover", existing.cover, incoming.cover),
    level: field("level", existing.level, incoming.level),
    levelPrecise: field("levelPrecise", existing.levelPrecise, incoming.levelPrecise),
    genre: field("genre", existing.genre, incoming.genre),
    addedVersion: field("addedVersion", existing.addedVersion, incoming.addedVersion),
    bpm: field("bpm", existing.bpm, incoming.bpm),
    noteDesigner: field("noteDesigner", existing.noteDesigner, incoming.noteDesigner),
    noteCounts: field("noteCounts", existing.noteCounts, incoming.noteCounts),
    metadata: field("metadata", existing.metadata, incoming.metadata),
    extras: { ...existing.extras, ...incoming.extras },
  };
}

/** A stage that merges a source's charts into the charts collected so far. */
export function asCatalogFetcher(source: (context: CatalogFetchContext) => Promise<SourceChart[]>, mode: FetcherMode = "default"): CatalogStage["run"] {
  return async (context, charts) => {
    const merged = mergeCharts(charts, await source(context), mode, context.log);
    context.log.debug({ songCount: merged.length }, "Merged source charts");
    return merged;
  };
}

export function mergeCharts(firstSongs: SourceChart[], secondSongs: SourceChart[], mode: FetcherMode, log: Logger): SourceChart[] {
  type Entry = { id: number; artist: string; addedVersion: string; first: boolean };

  let nextId = 0;
  const songById = new Map<number, SourceChart>();
  const idToEntries: Record<string, Entry[]> = {};

  const artistOf = (song: SourceChart) => value(song.artist) || "";
  const versionOf = (song: SourceChart) => {
    const addedVersion = value(song.addedVersion);
    return addedVersion === undefined || addedVersion === null ? "" : String(addedVersion);
  };

  const addEntry = (songKey: string, artist: string, addedVersion: string, isFirst: boolean, song: SourceChart): number => {
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

  const mergeEntry = (targetEntry: Entry, songKey: string, song: SourceChart, isFirst: boolean) => {
    const mergedSong = mergeChart(songById.get(targetEntry.id)!, song, log);
    removeEntry(songKey, targetEntry.id);
    addEntry(songKey, artistOf(mergedSong), versionOf(mergedSong), isFirst, mergedSong);
  };

  const processSong = (song: SourceChart, first: boolean) => {
    const songKey = catalogChartKey(song);
    const currentArtist = artistOf(song);
    const currentAddedVersion = versionOf(song);
    const songMode = song.mode || mode;

    let target: Entry | null = null;
    const candidates = idToEntries[songKey] || [];

    if (first) {
      // Within the collected charts, only an exact artist and addedVersion match is the same chart (a duplicate record).
      // An undefined addedVersion acts as a wildcard.
      const exactMatch = candidates.find(c =>
        c.artist === currentArtist &&
        (c.addedVersion === currentAddedVersion || !c.addedVersion || !currentAddedVersion)
      );
      if (exactMatch) target = exactMatch;
    } else {
      // A fetched chart merges into the closest candidate, preferring those with a matching addedVersion.
      const findBest = (pool: Entry[]): Entry | null => {
        let best: Entry | null = null;
        let minDist = Infinity;
        for (const candidate of pool) {
          if (candidate.artist === currentArtist) {
            return candidate;
          }
          const dist = levenshtein(candidate.artist, currentArtist);
          if (dist < minDist) {
            minDist = dist;
            best = candidate;
          }
        }
        return best;
      };

      // undefined is a wildcard only when one side is defined
      const versionMatched = candidates.filter(c =>
        (c.addedVersion === currentAddedVersion && (!!c.addedVersion || !!currentAddedVersion)) ||
        (!c.addedVersion && !!currentAddedVersion) ||
        (!!c.addedVersion && !currentAddedVersion)
      );
      let bestCandidate = findBest(versionMatched);

      // When versions differ, only a collected chart (a closest sibling) may be matched, never another fetched chart.
      if (!bestCandidate && candidates.length > 0) {
        const firstSourceCandidates = candidates.filter(c => c.first);
        if (firstSourceCandidates.length > 0) {
          bestCandidate = findBest(firstSourceCandidates);
        }
      }

      if (bestCandidate) target = bestCandidate;
    }

    if (songMode === "default") {
      if (!target) {
        addEntry(songKey, currentArtist, currentAddedVersion, first, song);
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
  };

  for (const song of firstSongs) processSong(song, true);

  // Version-matching fetched charts go first, so a non-matching chart cannot claim a collected chart
  // through the sibling fallback before the matching chart does.
  const sortedSecondSongs = [...secondSongs].sort((a, b) => {
    const aVer = versionOf(a);
    const bVer = versionOf(b);
    const aCandidates = idToEntries[catalogChartKey(a)] || [];
    const bCandidates = idToEntries[catalogChartKey(b)] || [];
    const aMatches = aCandidates.some(c => c.addedVersion === aVer && (!!c.addedVersion || !!aVer)) ? 0 : 1;
    const bMatches = bCandidates.some(c => c.addedVersion === bVer && (!!c.addedVersion || !!bVer)) ? 0 : 1;
    return aMatches - bMatches;
  });

  for (const song of sortedSecondSongs) processSong(song, false);

  return [...songById.values()];
}
