import { getCurrentVersion } from "@tomomai/catalog/metadata";
import type { Chart } from "./types";
import { uniqueSongs, type SongSummary } from "./fuzzy";
import { hasAudioPreview, isHeardle } from "./heardle";

const DEFAULT_API = "https://www.tomomai.lol";
const TTL_MS = 60 * 60 * 1000; // 1 hour

function apiBase(): string {
  return process.env.TOMOMAI_API_URL?.replace(/\/$/, "") ?? DEFAULT_API;
}

async function fetchCatalogue(): Promise<Chart[]> {
  // The pool only ever uses jp charts (see filterPool), and the API requires
  // region + gameVersion, so fetch exactly the jp slice at the current
  // version (~1 MB instead of the old full-catalogue 14 MB).
  // `no-store` + the module-level memo below (1h TTL) keep this cheap; the
  // network fetch only happens after a cold start or memo expiry.
  const url = `${apiBase()}/api/v1/songs?region=jp&gameVersion=${getCurrentVersion("jp")}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to fetch song catalogue: ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as { songs: Chart[] };
  return body.songs;
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
    if (c.type !== "std" && c.type !== "dx") return false;
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
// A simple module-level memo with TTL is plenty: each server instance
// fetches the jp slice (~1 MB) once per hour.

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
