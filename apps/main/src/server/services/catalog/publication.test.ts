import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CanonicalGameId } from "@/lib/games/ids";
import type { ProxyRow } from "@/test/pg-proxy";

const proxy = await vi.hoisted(async () => (await import("@/test/pg-proxy")).createProxyDb());
const { putObject } = vi.hoisted(() => ({ putObject: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: proxy.db }));
vi.mock("@/lib/r2", () => ({ putR2Object: putObject }));
import { publishSongCatalog } from "./publication";
import { CATALOG_WRITE_LOCK_ID } from "./ingestion/lock";
import { parentCatalogKey, songCatalogKey } from "@/lib/api/catalog-location";

const parent = {
  songId: "Ab3xK9pQ", songName: "Test", artist: "Artist", cover: null,
  type: 1, genre: "maimai", difficulty: 3, bpm: 180, disambiguator: 0,
};
const instance = {
  level: "13", levelPrecise: 133, region: "jp", gameVersion: 11, addedVersion: 10, noteDesigner: null,
};

// A game's stored charts answer only a read of that game's catalog.
function store(game: CanonicalGameId, rows: ProxyRow[]) {
  proxy.answer(({ table, params }) => table === "parent_song" && params.includes(game) ? rows : undefined);
}

function published() {
  return new Map(putObject.mock.calls.map(([object]) => [object.key, JSON.parse(object.body)]));
}

beforeEach(() => {
  proxy.reset();
  putObject.mockReset();
  putObject.mockResolvedValue(undefined);
});

describe("publishSongCatalog", () => {
  it("publishes the game's charts with the estimates their sources recorded, under the catalog lock", async () => {
    const metadata = { levelPreciseEstimated: true, addedVersionEstimated: true, source: { provider: "otoge-db", id: "2490" }, noteCounts: { air: 331 } };
    store("chunithm", [{ parent: { ...parent, type: 0 }, instance: { ...instance, gameVersion: 9, addedVersion: 8, metadata } }]);
    const result = await publishSongCatalog("chunithm");
    const object = putObject.mock.calls.find(([object]) => object.key === songCatalogKey("chunithm", "jp", 9))?.[0];
    const body = JSON.parse(object.body);
    expect(body).toMatchObject({ game: "chunithm", songs: [{ addedVersion: 8, levelPrecise: 133, levelPreciseEstimated: true, addedVersionEstimated: true }] });
    expect(body.songs[0]).not.toHaveProperty("metadata");
    expect(putObject.mock.calls.every(([object]) => object.key.startsWith("catalog/v2/chunithm/"))).toBe(true);
    expect(result.songCount).toBe(1);
    expect(proxy.transactions).toEqual(["begin", "commit"]);
    expect(proxy.queries[0].sql).toBe(`select pg_advisory_xact_lock(${CATALOG_WRITE_LOCK_ID})`);
  });

  it("publishes no chart of another game", async () => {
    store("chunithm", [{ parent: { ...parent, type: 0 }, instance: { ...instance, gameVersion: 9 } }]);
    await expect(publishSongCatalog("maimai")).resolves.toMatchObject({ songCount: 0 });
    expect(published().get(parentCatalogKey("maimai"))).toEqual({ game: "maimai", parents: [] });
  });

  it("deduplicates parents, emits composite IDs and overwrites empty slices", async () => {
    const confirmed = { ...instance, metadata: { levelPreciseEstimated: false, addedVersionEstimated: false } };
    store("maimai", [{ parent, instance: confirmed }, { parent, instance: { ...instance, gameVersion: 12 } }]);
    const result = await publishSongCatalog("maimai");
    const objects = published();
    expect(objects.get(parentCatalogKey("maimai"))).toEqual({ game: "maimai", parents: [parent] });
    const [song] = objects.get(songCatalogKey("maimai", "jp", 11)).songs;
    expect(song.songId).toBe("Ab3xK9pQ:j11");
    expect(song).not.toHaveProperty("metadata");
    expect(song).not.toHaveProperty("levelPreciseEstimated");
    expect(song).not.toHaveProperty("addedVersionEstimated");
    expect(objects.get(songCatalogKey("maimai", "jp", -13))).toEqual({ game: "maimai", songs: [] });
    expect(result.songCount).toBe(2);
    expect(result.bytes).toBeGreaterThan(0);
  });

  it("publishes every instance field except the note counts, which the per-game details carry", async () => {
    store("maimai", [{ parent, instance: { ...instance, noteDesigner: "Designer", metadata: { levelPreciseEstimated: true, noteCounts: { tap: 100 } } } }]);
    await publishSongCatalog("maimai");
    const { disambiguator: _disambiguator, ...parentFields } = parent;
    expect(published().get(songCatalogKey("maimai", "jp", 11)).songs).toEqual([{
      ...parentFields, songId: "Ab3xK9pQ:j11", level: "13", levelPrecise: 133, region: "jp", gameVersion: 11, addedVersion: 10,
      noteDesigner: "Designer", levelPreciseEstimated: true,
    }]);
  });

  it("validates every slice before writing any objects", async () => {
    store("maimai", [{ parent, instance: { ...instance, levelPrecise: "invalid" } }]);
    await expect(publishSongCatalog("maimai")).rejects.toThrow();
    expect(putObject).not.toHaveBeenCalled();
  });

  it("rebuilds every catalog object after a publication failure", async () => {
    store("maimai", [{ parent, instance }]);
    await publishSongCatalog("maimai");
    const expectedKeys = putObject.mock.calls.map(([object]) => object.key).sort();
    putObject.mockClear();
    putObject.mockRejectedValueOnce(new Error("R2 unavailable"));
    await expect(publishSongCatalog("maimai")).rejects.toThrow("R2 unavailable");
    putObject.mockClear();
    await expect(publishSongCatalog("maimai")).resolves.toMatchObject({ songCount: 1 });
    expect(putObject.mock.calls.map(([object]) => object.key).sort()).toEqual(expectedKeys);
  });
});
