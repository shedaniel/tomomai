import { toRomaji } from "./kuroshiro";
import slug from "slug";

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
  type: "std" | "dx";
}

/**
 * Song with pre-computed slug
 */
export interface SongWithSlug extends SongForSlug {
  slug: string;
}

/**
 * Generate full slug for a song (includes type suffix)
 */
export async function getSongSlug(song: SongForSlug): Promise<string> {
  const baseSlug = await generateSongSlug(song.songName, song.artist);
  return `${baseSlug}-${song.type}`;
}

/**
 * Generate slugs for multiple songs in parallel
 */
export async function getSongSlugs<T extends SongForSlug>(songs: T[]): Promise<(T & { slug: string })[]> {
  const slugs = await Promise.all(songs.map(song => getSongSlug(song)));
  return songs.map((song, i) => ({ ...song, slug: slugs[i] }));
}

/**
 * Find a song from a slug in a list of songs with pre-computed slugs
 */
export function getSongFromSlug<T extends SongWithSlug>(slug: string, songs: T[]): T | null {
  return songs.find(song => song.slug === slug) || null;
}
