import { definedKeyOf, type CodeKey, type CodedGame } from "./codes.ts";

/** A chart of one catalog slice as `GET /api/v1/games/{game}/songs` publishes it, with its codes decoded. */
export type CatalogSong<G extends CodedGame> = {
  songId: string;
  songName: string;
  artist: string;
  cover: string | null;
  type: CodeKey<G, "chartType">;
  genre: string;
  difficulty: CodeKey<G, "difficulty">;
  level: string;
  levelPrecise: number;
  region: string;
  gameVersion: number;
  addedVersion: number;
  bpm: number | null;
  noteDesigner: string | null;
  levelPreciseEstimated?: true;
  addedVersionEstimated?: true;
};

type PublishedSong = Omit<CatalogSong<CodedGame>, "type" | "difficulty"> & { type: number; difficulty: number };

// Structural, so undici's fetch (render passes its own dispatcher) fits as well as the platform fetch.
export type CatalogResponse = { readonly ok: boolean; readonly status: number; json(): Promise<unknown> };
export type CatalogFetcher = (url: string) => Promise<CatalogResponse>;

function gameApiUrl(base: string, game: CodedGame): string {
  return `${base.replace(/\/+$/, "")}/api/v1/games/${game}`;
}

export function catalogVersionsUrl(base: string, game: CodedGame, region: string): string {
  return `${gameApiUrl(base, game)}/songs/versions?${new URLSearchParams({ region })}`;
}

export function catalogSliceUrl(base: string, game: CodedGame, region: string, gameVersion: number): string {
  return `${gameApiUrl(base, game)}/songs?${new URLSearchParams({ region, gameVersion: String(gameVersion) })}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isGameVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= -32768 && value <= 32767;
}

/** Validates a slice response body and decodes each chart's codes with the game's code table. */
export function decodeCatalogSlice<G extends CodedGame>(body: unknown, game: G): CatalogSong<G>[] {
  if (!isRecord(body) || !Array.isArray(body.songs)) throw new Error("Invalid song catalog response");
  if (body.game !== game) throw new Error(`Expected a ${game} song catalog, got ${String(body.game)}`);
  return body.songs.map((song: PublishedSong) => ({
    ...song,
    type: definedKeyOf(game, "chartType", song.type),
    difficulty: definedKeyOf(game, "difficulty", song.difficulty),
  }));
}

export async function fetchCatalogSlice<G extends CodedGame>(
  base: string,
  game: G,
  region: string,
  gameVersion: number,
  fetcher: CatalogFetcher = fetch,
): Promise<CatalogSong<G>[]> {
  const response = await fetcher(catalogSliceUrl(base, game, region, gameVersion));
  if (!response.ok) throw new Error(`Song catalog fetch failed: ${response.status}`);
  return decodeCatalogSlice(await response.json(), game);
}

/** Fetches the slice of the version the region currently plays, as the versions endpoint names it. */
export async function fetchCurrentCatalogSlice<G extends CodedGame>(
  base: string,
  game: G,
  region: string,
  fetcher: CatalogFetcher = fetch,
): Promise<CatalogSong<G>[]> {
  const response = await fetcher(catalogVersionsUrl(base, game, region));
  if (!response.ok) throw new Error(`Song catalog versions fetch failed: ${response.status}`);
  const body = await response.json();
  const currentVersion = isRecord(body) ? body.currentVersion : undefined;
  if (!isGameVersion(currentVersion)) throw new Error(`Invalid current ${game} ${region} catalog version`);
  return fetchCatalogSlice(base, game, region, currentVersion, fetcher);
}
