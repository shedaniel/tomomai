import { VersionId } from "@/lib/metadata";
import { Difficulty, Region, SongType } from "@/lib/types";
import { UpdateSong } from "@/lib/types/update";
import { isImportant, Pending, PendingSong, unwrapUndefined, value } from "@/server/utils/admin/type";
import { type Logger } from "pino";
import { DxDataFetcher } from "./dxrating";
import { FallbackFetcher } from "./fallback";
import { MaimaiAfterFetcher } from "./maimai-after-fetch";
import { MaimaiBaseFetcher } from "./maimai-base-songs";
import { MaimaiScraperFetcher } from "./maimai-scraper";
import { OtogeDbFetcher } from "./otoge-db";
import deepEqual from "deep-equal";
import { normalizeGenre, normalizeName } from "@/lib/name-utils";
import { isNullOrUndefined, levenshtein } from "@/lib/utils";
import { FillLevelPreciseFetcher } from "./fill-level";

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
type SongWithOrigin = PendingSong & { addedFetcher: number; modifiedFetchers: number[] };
export type SongWithMode = PendingSong & { mode: FetcherMode | undefined } | PendingSong
export type SongFetcher = (context: FetchingContextExtended, songs: PendingSong[]) => Promise<PendingSong[]>;

function key(song: PendingSong): SongKey;
function key(song: null | undefined): null;
function key(song: PendingSong | null | undefined): SongKey | null;
function key(song: PendingSong | null | undefined): SongKey | null {
  if (!song) {
    return null;
  }
  return `${song.songName}@${song.type}@${song.difficulty}`;
}

type Taker<T> = (a: PendingSong, b: PendingSong, av: Pending<T>, bv: Pending<T>, fieldName: string) => Pending<T>;

export function asFetcher(promise: (context: FetchingContext) => Promise<SongWithMode[]>, mode: FetcherMode = "default"): SongFetcher {
  return async (context, songs) => {
    const childLog = context.log.child({ mode });
    const fetched = await promise(context);
    const take = taker(childLog)
    const merged = mergeSongs(songs, fetched, mode, childLog, merger(childLog, take), take);
    childLog.debug(`Merged ${songs.length} songs with ${fetched.length} songs into ${merged.length} songs`);
    return merged;
  };
}

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

export const taker: (log: Logger) => Taker<T> = (log: Logger) => <T>(a: PendingSong, b: PendingSong, av: Pending<T>, bv: Pending<T>, fieldName: string): Pending<T> => {
  const aImportant = isImportant(av), bImportant = isImportant(bv);
  const aValue = value(av), bValue = value(bv);
  if (aImportant && bImportant) {
    if (aValue !== bValue) {
      log.warn(
        { fieldName, aValue, bValue, a, b, song: key(a) },
        `Data mismatch: important field '${fieldName}' has conflicting values`
      );
    }

    return bv;
  } else if (bImportant) {
    if (aValue !== bValue && !!aValue) {
      log.info(
        { fieldName, aValue, bValue, a, b, song: key(a) },
        `Data mismatch: important field from B '${fieldName}' has conflicting values`
      );
    }

    return bv;
  } else if (aImportant) {
    if (aValue !== bValue && !!bValue) {
      log.info(
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

export function mergeSongs(
  firstSongs: SongWithMode[],
  secondSongs: SongWithMode[],
  mode: FetcherMode,
  childLog: Logger,
  merger: (first: SongWithMode, second: SongWithMode) => SongWithMode,
  take: Taker<any>
) {
  type SongKeyWithExtra = `${SongKey}@${string}@${string}`;
  type Entry = { key: SongKeyWithExtra; artist: string; addedVersion: string };

  const added: Record<SongKeyWithExtra, PendingSong> = {};
  const idToEntries: Record<SongKey, Entry[]> = {};

  // Helper: Manage key updates in our lookup map
  const updateKeyMap = (id: SongKey, oldKey: SongKeyWithExtra | null, newKey: SongKeyWithExtra, newArtist: string, newAddedVersion: string) => {
    if (!idToEntries[id]) idToEntries[id] = [];
    const entries = idToEntries[id];

    // Remove old key if it exists (crucial for re-keying after merge)
    if (oldKey) {
      const idx = entries.findIndex(e => e.key === oldKey);
      if (idx !== -1) entries.splice(idx, 1);
    }

    // Add new key if not already present
    if (!entries.find(e => e.key === newKey)) {
      entries.push({ key: newKey, artist: newArtist, addedVersion: newAddedVersion });
    }
  };

  const allSongs = [
    ...firstSongs.map(song => ({ song, first: true })),
    ...secondSongs.map(song => ({ song, first: false }))
  ];

  for (const { song, first } of allSongs) {
    const id: SongKey = key(song);
    const currentArtist = value(song.artist) || "";
    const addedVersionValue = value(song.addedVersion);
    const currentAddedVersion = addedVersionValue !== undefined && addedVersionValue !== null ? String(addedVersionValue) : "";
    const songMode = song.mode || mode;

    let targetKey: SongKeyWithExtra | null = null;
    const candidates = idToEntries[id] || [];

    // 1. Determine Target Key
    if (first) {
      // Local Source: Strict Matching
      // Only merge if there is an EXACT artist AND addedVersion match (duplicate record in same source)
      // undefined addedVersion acts as a wildcard
      const exactMatch = candidates.find(c =>
        c.artist === currentArtist &&
        (c.addedVersion === currentAddedVersion || !c.addedVersion || !currentAddedVersion)
      );
      if (exactMatch) targetKey = exactMatch.key;
    } else {
      // Fetched Source: Fuzzy Matching (No Threshold)
      // Find the "closest" match among existing entries
      // undefined addedVersion acts as a wildcard that can match any version
      let bestCandidate: Entry | null = null;
      let minDistance = Infinity;

      for (const candidate of candidates) {
        // Check if addedVersion matches (undefined is wildcard)
        const versionMatches =
          candidate.addedVersion === currentAddedVersion ||
          !candidate.addedVersion ||
          !currentAddedVersion;

        if (!versionMatches) {
          continue;
        }

        // Optimization: Exact match is distance 0
        if (candidate.artist === currentArtist) {
          minDistance = 0;
          bestCandidate = candidate;
          break;
        }

        // Calculate distance for artist only (addedVersion already matched)
        const dist = levenshtein(candidate.artist, currentArtist);

        // Strictly closest (<). If equal distance, prefers the one found first.
        if (dist < minDistance) {
          minDistance = dist;
          bestCandidate = candidate;
        }
      }

      if (bestCandidate) {
        targetKey = bestCandidate.key;
      }
    }

    // 2. Execute Merge/Add Logic
    const newKeyBase: SongKeyWithExtra = `${id}@${currentArtist}@${currentAddedVersion}`;

    if (songMode === "default") {
      if (!targetKey) {
        // New Entry
        added[newKeyBase] = song;
        updateKeyMap(id, null, newKeyBase, currentArtist, currentAddedVersion);
      } else {
        // Merge Entry
        const existingSong = added[targetKey];
        const mergedSong = merger(existingSong, song);

        // Re-calculate Key based on `take` preference (artist and addedVersion might change)
        const newArtistVal = value(take(existingSong, song, existingSong.artist, song.artist, "artist")) || "";
        const takenAddedVersion = value(take(existingSong, song, existingSong.addedVersion, song.addedVersion, "addedVersion"));
        const newAddedVersionVal = takenAddedVersion !== undefined && takenAddedVersion !== null ? String(takenAddedVersion) : "";
        const mergedKey: SongKeyWithExtra = `${id}@${newArtistVal}@${newAddedVersionVal}`;

        // If the key changed (artist or addedVersion renamed), move the record
        if (mergedKey !== targetKey) {
          delete added[targetKey];
          updateKeyMap(id, targetKey, mergedKey, newArtistVal, newAddedVersionVal);
        }
        added[mergedKey] = mergedSong;
      }
    }
    else if (songMode === "only-fallback") {
      if (first) {
        // Force add/overwrite local
        added[newKeyBase] = song;
        updateKeyMap(id, targetKey, newKeyBase, currentArtist, currentAddedVersion);
      } else if (!targetKey) {
        // Only add fetched if NO match found (fuzzy or exact)
        added[newKeyBase] = song;
        updateKeyMap(id, null, newKeyBase, currentArtist, currentAddedVersion);
      }
    }
    else if (songMode === "only-modify") {
      if (first) {
        added[newKeyBase] = song;
        updateKeyMap(id, targetKey, newKeyBase, currentArtist, currentAddedVersion);
      } else if (targetKey) {
        // Only merge fetched if match FOUND
        const existingSong = added[targetKey];
        const mergedSong = merger(existingSong, song);

        const newArtistVal = value(take(existingSong, song, existingSong.artist, song.artist, "artist")) || "";
        const takenAddedVersion2 = value(take(existingSong, song, existingSong.addedVersion, song.addedVersion, "addedVersion"));
        const newAddedVersionVal = takenAddedVersion2 !== undefined && takenAddedVersion2 !== null ? String(takenAddedVersion2) : "";
        const mergedKey: SongKeyWithExtra = `${id}@${newArtistVal}@${newAddedVersionVal}`;

        if (mergedKey !== targetKey) {
          delete added[targetKey];
          updateKeyMap(id, targetKey, mergedKey, newArtistVal, newAddedVersionVal);
        }
        added[mergedKey] = mergedSong;
      }
    }
    else {
      childLog.error(`Unknown mode ${songMode} for song ${id}`);
    }
  }

  return Object.values(added);
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

export { key }
