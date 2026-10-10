import { fetchCurrentCatalogSlice } from "@tomomai/games/catalog-client";
import type { Chart } from "./types";
import { uniqueSongs, type SongSummary } from "./fuzzy";
import { hasAudioPreview, isHeardle } from "./heardle";

const DEFAULT_API = "https://www.tomomai.lol";
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function fetchCatalogue(): Promise<Chart[]> {
  const base = process.env.TOMOMAI_API_URL ?? DEFAULT_API;
  // The daily module memo bounds transfers without relying on Next's data-cache size limit.
  return fetchCurrentCatalogSlice(base, "maimai", "jp", url => fetch(url, { cache: "no-store" }));
}

/**
 * Apply gameplay filters: pickable songs only. Drops low-level charts where
 * the difficulty doesn't really qualify the song:
 *   - Expert: keep ≥ 11.0 (anything below is a stepping stone, not memorable)
 *   - Master / Re:MASTER: keep ≥ 12.0
 */
function filterPool(all: readonly Chart[]): Chart[] {
  const heardle = isHeardle();
  return all.filter((c) => {
    if (c.region !== "jp") return false;
    if (c.cover == null) return false;
    if (c.difficulty === "expert") {
      if (c.levelPrecise < 11.0) return false;
    } else if (c.difficulty === "master" || c.difficulty === "remaster") {
      if (c.levelPrecise < 12.0) return false;
    } else {
      return false;
    }
    // Heardle additionally requires an Apple Music preview to be resolvable.
    if (heardle && !hasAudioPreview(c)) return false;
    return true;
  });
}

// ---------- In-process cache ---------------------------------------------
// A daily TTL matches the game cadence and limits cross-app transfers.

type CacheEntry<T> = { value: T; expiresAt: number };
let catalogue: CacheEntry<Chart[]> | Promise<Chart[]> | null = null;
let pool: CacheEntry<Chart[]> | null = null;
let summaries: CacheEntry<SongSummary[]> | null = null;

async function getCatalogueInternal(): Promise<Chart[]> {
  const now = Date.now();
  if (catalogue && !(catalogue instanceof Promise) && catalogue.expiresAt > now) {
    return catalogue.value;
  }
  if (catalogue instanceof Promise) return catalogue;
  const p = (async () => {
    const value = await fetchCatalogue();
    catalogue = { value, expiresAt: Date.now() + TTL_MS };
    return value;
  })();
  catalogue = p;
  try {
    return await p;
  } catch (err) {
    catalogue = null;
    throw err;
  }
}

export async function getCatalogue(): Promise<Chart[]> {
  return getCatalogueInternal();
}

/** The pickable pool (filtered + cached). */
export async function getSongPool(): Promise<Chart[]> {
  const now = Date.now();
  if (pool && pool.expiresAt > now) return pool.value;
  const all = await getCatalogueInternal();
  const value = filterPool(all);
  pool = { value, expiresAt: now + TTL_MS };
  return value;
}

/** Cached deduplicated song list for /api/search. */
export async function getSongSummaries(): Promise<SongSummary[]> {
  const now = Date.now();
  if (summaries && summaries.expiresAt > now) return summaries.value;
  const all = await getCatalogueInternal();
  const value = uniqueSongs(all);
  summaries = { value, expiresAt: now + TTL_MS };
  return value;
}
