/**
 * Process-level cache of the song catalogue from /api/v1/songs.
 *
 * Replaces all DB access in the render service. The catalogue is public,
 * CDN-cached (s-maxage=3600), and contains every chart's static fields
 * (songName, cover, difficulty, level, levelPrecise, type, addedVersion).
 * We fetch it once and hold it in-process for CATALOG_TTL_MS, since render is a
 * long-lived process.
 *
 * The token carries only score data (songId + achievement + fc + fs); this
 * module supplies the catalog fields the renderer joins by songId.
 */

import { getLogger } from "./request-logger";
import { Agent } from "undici";

const CATALOG_URL =
  process.env.CATALOG_URL ??
  process.env.NEXT_PUBLIC_SITE_URL ??
  "https://tomomai.lol";

const CATALOG_TTL_MS = 1000 * 60 * 5; // 5 min — balances freshness vs CDN reuse
const FETCH_TIMEOUT_MS = 15_000;

const sharedAgent = new Agent({
  connect: { timeout: 30_000, rejectUnauthorized: false },
  connections: 16,
});

export interface CatalogEntry {
  songId: string;
  songName: string;
  artist: string;
  cover: string;
  type: string;
  genre: string;
  difficulty: string;
  level: string;
  levelPrecise: number;
  region: string;
  gameVersion: number;
  addedVersion: number;
  bpm: number | null;
  noteDesigner: string | null;
}

let cache: { map: Map<string, CatalogEntry>; fetchedAt: number } | null = null;
let inflight: Promise<Map<string, CatalogEntry>> | null = null;

async function fetchCatalog(): Promise<Map<string, CatalogEntry>> {
  const log = getLogger();
  const url = `${CATALOG_URL.replace(/\/+$/, "")}/api/v1/songs`;
  log.info({ url }, "Fetching song catalogue");
  const startTime = Date.now();

  const response = await fetch(url, {
    // @ts-ignore - dispatcher exists on undici but not in lib.dom
    dispatcher: sharedAgent,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Catalogue fetch failed: ${response.status} ${response.statusText}`);
  }
  const body = (await response.json()) as { songs: CatalogEntry[] };
  const map = new Map<string, CatalogEntry>();
  for (const song of body.songs) {
    map.set(song.songId, song);
  }
  log.info(
    { count: map.size, durationMs: Date.now() - startTime },
    "Catalogue loaded",
  );
  return map;
}

/** Returns the catalogue map, fetching if stale. Thread-safe via inflight dedupe. */
export async function getCatalog(): Promise<Map<string, CatalogEntry>> {
  if (cache && Date.now() - cache.fetchedAt < CATALOG_TTL_MS) {
    return cache.map;
  }
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const map = await fetchCatalog();
      cache = { map, fetchedAt: Date.now() };
      return map;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Look up a single chart by its publicId. Throws if not found (stale chart). */
export async function getCatalogEntry(songId: string): Promise<CatalogEntry> {
  const catalog = await getCatalog();
  const entry = catalog.get(songId);
  if (!entry) {
    throw new Error(`Chart not in catalogue: ${songId}`);
  }
  return entry;
}
