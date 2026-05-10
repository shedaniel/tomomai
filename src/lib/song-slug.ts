import { toEverything, toRomaji } from "./kuroshiro";
import slug from "slug";
import { SongType } from "./types";

/**
 * Generate a URL-safe slug from a song name and artist
 * Format: song-name-artist
 * Uses kuroshiro for Japanese romanization
 */
export async function generateSongSlug(songName: string, artist: string): Promise<string> {
  // Romanize Japanese text
  const processedName = await toRomaji(songName);
  const processedArtist = await toRomaji(artist);

  // Slugify the name, remove whitespace from artist
  const cleanedName = slug(processedName);
  const cleanedArtist = slug(processedArtist.replace(/\s+/g, ''));

  // If name is empty but artist exists
  if (!cleanedName && cleanedArtist) {
    return `_-${cleanedArtist}`;
  }

  // If artist is empty but name exists
  if (cleanedName && !cleanedArtist) {
    return cleanedName;
  }

  // If both are empty, use a hash of the original strings
  if (!cleanedName && !cleanedArtist) {
    return `song-${simpleHash(songName + artist)}`;
  }

  return `${cleanedName}-${cleanedArtist}`;
}

/**
 * Simple hash function for fallback slugs
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Normalize a string for search/comparison
 */
export function normalizeForSearch(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Song type for slug operations
 */
export interface SongForSlug {
  songName: string;
  artist: string;
  type: SongType;
}

/**
 * Song with pre-computed slug
 */
export interface SongWithSlug extends SongForSlug {
  slug: string;
  aliases?: string[];
}

/**
 * Generate full slug for a song (includes type suffix)
 */
export async function getSongSlug(song: SongForSlug): Promise<string> {
  const baseSlug = await generateSongSlug(song.songName, song.artist);
  return `${baseSlug}-${song.type}`;
}

/**
 * Module-level memo keyed by (songName, artist, type). Slug + aliases are
 * pure deterministic functions of those three fields, and computing them
 * runs `kuroshiro`/`kuromoji` (Japanese morphological analyzer) which is
 * extremely expensive — ~1.6ms per song × 1602 songs × 4 calls/song was
 * dominating every server render. The catalog only changes when the
 * songs table changes (rare), so cache forever in-process.
 */
const slugCache = new Map<string, { slug: string; aliases: string[] }>();

async function computeSlugAndAliases(
  song: SongForSlug
): Promise<{ slug: string; aliases: string[] }> {
  const processedName = await toRomaji(song.songName);
  const processedArtist = await toRomaji(song.artist);

  const nameEverything = await toEverything(song.songName);
  const artistEverything = await toEverything(song.artist);

  const cleanedName = slug(processedName);
  const cleanedArtist = slug(processedArtist.replace(/\s+/g, ''));

  let baseSlug;
  if (!cleanedName && cleanedArtist) {
    baseSlug = `_-${cleanedArtist}`;
  } else if (cleanedName && !cleanedArtist) {
    baseSlug = cleanedName;
  } else if (!cleanedName && !cleanedArtist) {
    baseSlug = `song-${simpleHash(song.songName + song.artist)}`;
  } else {
    baseSlug = `${cleanedName}-${cleanedArtist}`;
  }

  const fullSlug = `${baseSlug}-${song.type}`;
  const aliases = [
    processedName,
    processedArtist,
    nameEverything.romaji,
    nameEverything.katakana,
    nameEverything.hiragana,
    artistEverything.romaji,
    artistEverything.katakana,
    artistEverything.hiragana,
  ].filter(Boolean);

  return { slug: fullSlug, aliases };
}

/**
 * Generate slugs and aliases for multiple songs in parallel.
 * Uses an in-process cache so repeated calls (within the same process,
 * across requests) skip the kuroshiro round-trip.
 */
export async function getSongSlugs<T extends SongForSlug>(songs: T[]): Promise<(T & { slug: string; aliases: string[] })[]> {
  const results = await Promise.all(songs.map(async (song) => {
    const key = `${song.songName}||${song.artist}||${song.type}`;
    let cached = slugCache.get(key);
    if (!cached) {
      cached = await computeSlugAndAliases(song);
      slugCache.set(key, cached);
    }
    return {
      ...song,
      slug: cached.slug,
      aliases: cached.aliases,
    };
  }));

  return results;
}

/**
 * Find a song from a slug in a list of songs with pre-computed slugs
 */
export function getSongFromSlug<T extends SongWithSlug>(slug: string, songs: T[]): T | null {
  return songs.find(song => song.slug === slug) || null;
}
