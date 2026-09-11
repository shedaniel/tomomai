import type { Difficulty, SongType } from "./types";

export interface SongToParent {
  id: bigint;
  songName: string;
  type: SongType;
  difficulty: Difficulty;
  artist: string;
  genre: string;
  cover: string;
  bpm: number | null;
  addedVersion: number;
  region: string;
  gameVersion: number;
}

export interface ParentState {
  /** Database id; null for parents created by this resolution (not yet inserted). */
  id: bigint | null;
  songName: string;
  type: SongType;
  difficulty: Difficulty;
  disambiguator: number;
  artist: string;
  genre: string;
  cover: string;
  bpm: number | null;
  /** addedVersion values seen on this parent's children. */
  childAddedVersions: Set<number>;
  /** `${region}:${gameVersion}` combos already occupied by a child. */
  childRegionVersions: Set<string>;
}

export interface ResolveParentsResult {
  /** songId -> resolved parent (existing or newly created). */
  assignments: Map<bigint, ParentState>;
  /** Parents that must be inserted (id is null until the caller inserts them). */
  newParents: ParentState[];
}

function chartKey(s: { songName: string; type: string; difficulty: string }) {
  return `${s.songName}\u0000${s.type}\u0000${s.difficulty}`;
}

function regionVersionKey(s: { region: string; gameVersion: number }) {
  return `${s.region}:${s.gameVersion}`;
}

/**
 * Resolve a parent for each song row, reusing existing parents where the row
 * is another region/version instance of a known chart, and creating new
 * parents (with the next free disambiguator) where it is genuinely a new
 * chart. Pure function: the caller loads candidate parents and persists the
 * returned new parents / assignments.
 */
export function resolveParents(songsToParent: SongToParent[], existingParents: ParentState[]): ResolveParentsResult {
  const parentsByKey = new Map<string, ParentState[]>();
  for (const parent of existingParents) {
    const key = chartKey(parent);
    const list = parentsByKey.get(key) ?? [];
    list.push(parent);
    parentsByKey.set(key, list);
  }

  const assignments = new Map<bigint, ParentState>();
  const newParents: ParentState[] = [];

  // Deterministic order so batches always resolve the same way
  const sorted = [...songsToParent].sort((a, b) =>
    a.songName.localeCompare(b.songName)
    || a.type.localeCompare(b.type)
    || a.difficulty.localeCompare(b.difficulty)
    || a.addedVersion - b.addedVersion
    || a.artist.localeCompare(b.artist)
    || a.region.localeCompare(b.region)
    || a.gameVersion - b.gameVersion);

  const assign = (song: SongToParent, parent: ParentState) => {
    parent.childAddedVersions.add(song.addedVersion);
    parent.childRegionVersions.add(regionVersionKey(song));
    assignments.set(song.id, parent);
  };

  // Reserve stronger matches across the batch before metadata drift can claim a sibling.
  for (const matches of [
    (song: SongToParent, parent: ParentState) => parent.artist === song.artist && parent.childAddedVersions.has(song.addedVersion),
    (song: SongToParent, parent: ParentState) => parent.artist === song.artist,
    (song: SongToParent, parent: ParentState) => parent.childAddedVersions.has(song.addedVersion),
  ]) {
    for (const song of sorted) {
      if (assignments.has(song.id)) continue;
      const candidates = (parentsByKey.get(chartKey(song)) ?? []).filter(parent =>
        !parent.childRegionVersions.has(regionVersionKey(song)) && matches(song, parent));
      if (candidates.length === 1) assign(song, candidates[0]);
    }
  }

  for (const song of sorted) {
    if (assignments.has(song.id)) continue;
    const key = chartKey(song);
    const candidates = parentsByKey.get(key) ?? [];

    // Only parents without a child in this (region, gameVersion) are valid;
    // a conflict there means the row is by definition a different chart.
    const nonConflicting = candidates.filter(c => !c.childRegionVersions.has(regionVersionKey(song)));

    // 1. Exact artist match — the strongest cross-region signal. addedVersion
    //    is NOT reliable here: in production data it drifts across versions
    //    for the same chart (e.g. Circle-of-friends "Link": -1 early, -9
    //    later), while colliding charts carry distinct, stable artists.
    // 2. A sibling instance with the same addedVersion.
    // 3. The single remaining candidate (covers artist drift on
    //    non-colliding charts gaining a new region/version instance).
    const artistMatches = nonConflicting.filter(c => c.artist === song.artist);
    const versionMatches = (artistMatches.length > 0 ? artistMatches : nonConflicting)
      .filter(c => c.childAddedVersions.has(song.addedVersion));
    let parent = artistMatches.length === 1 ? artistMatches[0]
      : versionMatches.length === 1 ? versionMatches[0]
      : nonConflicting.length === 1 ? nonConflicting[0] : undefined;

    if (!parent) {
      // 4. New chart: next free disambiguator within the key group.
      const disambiguator = candidates.length === 0 ? 0 : Math.max(...candidates.map(c => c.disambiguator)) + 1;
      parent = {
        id: null,
        songName: song.songName,
        type: song.type,
        difficulty: song.difficulty,
        disambiguator,
        artist: song.artist,
        genre: song.genre,
        cover: song.cover,
        bpm: song.bpm,
        childAddedVersions: new Set(),
        childRegionVersions: new Set(),
      };
      newParents.push(parent);
      candidates.push(parent);
      parentsByKey.set(key, candidates);
    }

    assign(song, parent);
  }

  return { assignments, newParents };
}
