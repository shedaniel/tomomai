import type { Chart } from "./types";
import { levenshtein } from "@tomomai/utils";
import { createSearchIndex, searchIndex, type SearchField, type SearchIndex } from "@tomomai/utils/search";

/** Lowercase + strip diacritics + drop punctuation (no whitespace). */
export function normalize(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

export type SongSummary = {
  songId: string;
  songName: string;
  artist: string;
};

/** Deduplicate charts to one row per (songName, artist). */
export function uniqueSongs(charts: readonly Chart[]): SongSummary[] {
  const seen = new Map<string, SongSummary>();
  for (const c of charts) {
    const key = `${c.songName} ${c.artist}`;
    if (!seen.has(key)) {
      seen.set(key, { songId: c.songId, songName: c.songName, artist: c.artist });
    }
  }
  return [...seen.values()];
}

const SONG_FIELDS: SearchField<SongSummary>[] = [
  { get: song => song.songName, weight: 3 },
  { get: song => song.artist, weight: 2 },
];

let indexed: { songs: readonly SongSummary[]; index: SearchIndex<SongSummary> } | null = null;

/**
 * Top-N song suggestions, ranked by the shared site search: every query token must match the song name or
 * artist, ignoring case, width, kana script and small typos.
 */
export function searchSongs(
  songs: readonly SongSummary[],
  query: string,
  limit = 10,
): SongSummary[] {
  if (indexed?.songs !== songs) indexed = { songs, index: createSearchIndex(songs, SONG_FIELDS) };
  return searchIndex(indexed.index, query, { limit }).map(hit => hit.item);
}

/** Equality check for /api/submit — only matches against song name. */
export function isGuessCorrect(guess: string, songName: string): boolean {
  const g = normalize(guess);
  const s = normalize(songName);
  if (!g || !s) return false;
  if (g === s) return true;
  const tol = Math.max(1, Math.floor(s.length / 12));
  return levenshtein(g, s) <= tol;
}
