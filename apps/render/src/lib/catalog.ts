/**
 * Process-level cache of the song catalogue slices from /api/v1/games/maimai/songs.
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

import { fetchCatalogSlice, type CatalogSong } from "@tomomai/games/catalog-client";
import { Agent, fetch } from "undici";
import { getLogger } from "./request-logger";

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

type CatalogEntry = CatalogSong<"maimai">;
type Catalog = Map<string, CatalogEntry>;

const cache = new Map<string, { map: Catalog; fetchedAt: number }>();
const inflight = new Map<string, Promise<Catalog>>();

async function fetchCatalog(region: string, gameVersion: number): Promise<Catalog> {
  const log = getLogger();
  const startTime = Date.now();
  const songs = await fetchCatalogSlice(CATALOG_URL, "maimai", region, gameVersion, url => {
    log.info({ url }, "Fetching song catalogue");
    return fetch(url, { dispatcher: sharedAgent, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  });
  const map: Catalog = new Map(songs.map(song => [song.songId, song]));
  log.info(
    { count: map.size, durationMs: Date.now() - startTime },
    "Catalogue loaded",
  );
  return map;
}

async function getSlice(region: string, gameVersion: number): Promise<Catalog> {
  const key = `maimai:${region}:${gameVersion}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CATALOG_TTL_MS) return cached.map;
  const pending = inflight.get(key);
  if (pending) return pending;
  const request = fetchCatalog(region, gameVersion).then(map => {
    cache.delete(key);
    if (cache.size >= 128) cache.delete(cache.keys().next().value!);
    cache.set(key, { map, fetchedAt: Date.now() });
    return map;
  }).finally(() => { inflight.delete(key); });
  inflight.set(key, request);
  return request;
}

export async function getCatalog(songIds: readonly string[]): Promise<Catalog> {
  const slices = new Map<string, { region: string; gameVersion: number }>();
  for (const id of songIds) {
    const match = /^[A-Za-z0-9_-]{8}:([jic])(0|-?[1-9]\d*)$/.exec(id);
    if (!match) throw new Error(`Invalid song instance id: ${id}`);
    const region = { j: "jp", i: "intl", c: "cn" }[match[1]]!;
    const gameVersion = Number(match[2]);
    if (!Number.isInteger(gameVersion) || gameVersion < -32768 || gameVersion > 32767) {
      throw new Error(`Invalid song version: ${id}`);
    }
    slices.set(`${region}:${gameVersion}`, { region, gameVersion });
  }
  const result: Catalog = new Map();
  const maps = await Promise.all([...slices.values()].map(({ region, gameVersion }) => getSlice(region, gameVersion)));
  for (const map of maps) for (const [id, entry] of map) result.set(id, entry);
  return result;
}

/** The catalogue entry of a chart the token references. Every renderer draws its cover. */
export function catalogEntry(catalog: Catalog, songId: string): CatalogEntry & { cover: string } {
  const entry = catalog.get(songId);
  if (!entry) throw new Error(`Chart not in catalogue: ${songId}`);
  const { cover } = entry;
  if (cover === null) throw new Error(`Chart has no cover: ${songId}`);
  return { ...entry, cover };
}
