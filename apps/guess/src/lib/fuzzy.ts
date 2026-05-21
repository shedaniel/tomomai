import type { Chart } from "./types";
import { levenshtein } from "@tomomai/utils";

/** Lowercase + strip diacritics + drop punctuation (no whitespace). */
export function normalize(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

/** Lowercase + strip diacritics, keeping whitespace so we can tokenize. */
function tokenize(s: string): string[] {
  const flat = s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  return flat.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
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

const NO_MATCH = Number.POSITIVE_INFINITY;

/**
 * Score one query token against a song. Negative = better (sort ascending).
 * Considers both song name and artist; song-name matches outrank artist
 * matches at the same prefix/substring quality.
 */
function scoreToken(tok: string, sNorm: string, aNorm: string): number {
  let best = NO_MATCH;

  // Song name
  if (sNorm.startsWith(tok)) best = Math.min(best, -1000 + (sNorm.length - tok.length));
  else if (sNorm.includes(tok)) best = Math.min(best, -500 + sNorm.indexOf(tok));

  // Artist (slightly less preferred for the same shape of match)
  if (aNorm.startsWith(tok)) best = Math.min(best, -800 + (aNorm.length - tok.length));
  else if (aNorm.includes(tok)) best = Math.min(best, -300 + aNorm.indexOf(tok));

  if (best !== NO_MATCH) return best;

  // Fuzzy fallback — small typos against either field.
  const cap = Math.min(8, tok.length + 4);
  const dSong = levenshtein(tok, sNorm.slice(0, cap));
  const dArt = levenshtein(tok, aNorm.slice(0, cap));
  const d = Math.min(dSong, dArt);
  if (d > Math.max(1, Math.floor(tok.length / 3))) return NO_MATCH;
  return d * 100;
}

/**
 * Top-N song suggestions. Multi-token aware: each query token must match
 * somewhere in either the song name or artist. So `1234 ABCD` finds a song
 * whose artist contains `1234` and name contains `ABCD` (in any order).
 */
export function searchSongs(
  songs: readonly SongSummary[],
  query: string,
  limit = 10,
): SongSummary[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  const scored: { song: SongSummary; score: number }[] = [];
  for (const s of songs) {
    const sNorm = normalize(s.songName);
    const aNorm = normalize(s.artist);
    if (!sNorm && !aNorm) continue;

    let total = 0;
    let allMatched = true;
    for (const tok of tokens) {
      const r = scoreToken(tok, sNorm, aNorm);
      if (r === NO_MATCH) {
        allMatched = false;
        break;
      }
      total += r;
    }
    if (allMatched) scored.push({ song: s, score: total });
  }

  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, limit).map((x) => x.song);
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
