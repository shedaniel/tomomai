/**
 * Process-level cache of the song catalogue slices from /api/v1/games/{game}/songs.
 *
 * Replaces all DB access in the render service. The catalogue is public,
 * CDN-cached (s-maxage=3600), and contains every chart's static fields
 * (songName, cover, difficulty, level, levelPrecise, type, addedVersion).
 * We fetch it once and hold it in-process for CATALOG_TTL_MS, since render is a
 * long-lived process.
 *
 * The token carries only score data, and this module supplies the catalog
 * fields the renderer joins by songId.
 */

import { fetchCatalogSlice, type CatalogSong } from "@tomomai/games/catalog-client";
import type { CodedGame } from "@tomomai/games/codes";
import { parseSongId } from "@tomomai/games/song-ids";
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

type Catalog<G extends CodedGame> = Map<string, CatalogSong<G>>;

const cache = new Map<string, { map: Catalog<CodedGame>; fetchedAt: number }>();
const inflight = new Map<string, Promise<Catalog<CodedGame>>>();

async function fetchCatalog<G extends CodedGame>(game: G, region: string, gameVersion: number): Promise<Catalog<G>> {
  const log = getLogger();
  const startTime = Date.now();
  const songs = await fetchCatalogSlice(CATALOG_URL, game, region, gameVersion, url => {
    log.info({ url }, "Fetching song catalogue");
    return fetch(url, { dispatcher: sharedAgent, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  });
  const map: Catalog<G> = new Map(songs.map(song => [song.songId, song]));
  log.info(
    { count: map.size, durationMs: Date.now() - startTime },
    "Catalogue loaded",
  );
  return map;
}

async function getSlice<G extends CodedGame>(game: G, region: string, gameVersion: number): Promise<Catalog<G>> {
  const key = `${game}:${region}:${gameVersion}`;
  const cached = cache.get(key);
  // A key names its game, so whatever it holds is that game's slice.
  if (cached && Date.now() - cached.fetchedAt < CATALOG_TTL_MS) return cached.map as Catalog<G>;
  const pending = inflight.get(key);
  if (pending) return pending as Promise<Catalog<G>>;
  const request = fetchCatalog(game, region, gameVersion).then(map => {
    cache.delete(key);
    if (cache.size >= 128) cache.delete(cache.keys().next().value!);
    cache.set(key, { map, fetchedAt: Date.now() });
    return map;
  }).finally(() => { inflight.delete(key); });
  inflight.set(key, request);
  return request;
}

export async function getCatalog<G extends CodedGame>(game: G, songIds: readonly string[]): Promise<Catalog<G>> {
  const slices = new Map<string, { region: string; gameVersion: number }>();
  for (const id of songIds) {
    const parsed = parseSongId(id);
    if (parsed?.kind !== "instance") throw new Error(`Invalid song instance id: ${id}`);
    slices.set(`${parsed.region}:${parsed.gameVersion}`, parsed);
  }
  const result: Catalog<G> = new Map();
  const maps = await Promise.all([...slices.values()].map(({ region, gameVersion }) => getSlice(game, region, gameVersion)));
  for (const map of maps) for (const [id, entry] of map) result.set(id, entry);
  return result;
}

/** The catalogue entry of a chart the token references. Every renderer draws its cover. */
export function catalogEntry<G extends CodedGame>(catalog: Catalog<G>, songId: string): CatalogSong<G> & { cover: string } {
  const entry = catalog.get(songId);
  if (!entry) throw new Error(`Chart not in catalogue: ${songId}`);
  const { cover } = entry;
  if (cover === null) throw new Error(`Chart has no cover: ${songId}`);
  return { ...entry, cover };
}
