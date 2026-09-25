import { beforeEach, describe, expect, it, vi } from "vitest";

const { readRows, putObject } = vi.hoisted(() => ({ readRows: vi.fn(), putObject: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: {
  transaction: (fn: (tx: unknown) => Promise<unknown>) => fn({
    execute: vi.fn(),
    select: () => ({ from: () => ({ leftJoin: () => ({ where: () => ({ orderBy: readRows }) }) }) }),
  }),
} }));
vi.mock("@/lib/r2", () => ({ putR2Object: putObject }));
import { publishSongCatalog } from "./song-catalog";
import { songCatalogKey, catalogPrefix } from "@/lib/api/catalog-location";
import { resolveGame } from "@/lib/games/registry";

const parent = {
  songId: "Ab3xK9pQ", songName: "Test", artist: "Artist", cover: null,
  type: 1, genre: "maimai", difficulty: 3, bpm: 180, disambiguator: 0,
};
const instance = {
  level: "13", levelPrecise: 133, region: "jp", gameVersion: 11, addedVersion: 10, noteDesigner: null,
};

beforeEach(() => {
  readRows.mockReset(); putObject.mockReset(); putObject.mockResolvedValue(undefined);
});

describe("publishSongCatalog", () => {
  it("publishes a configured catalog while the game's public frontend remains disabled", async () => {
    const metadata = { levelPreciseEstimated: true, otogeDb: { id: "2490" } };
    readRows.mockResolvedValue([{ parent: { ...parent, type: 0 }, instance: { ...instance, gameVersion: 9, addedVersion: null, metadata } }]);
    expect(resolveGame("chunithm").enabled).toBe(false);
    const result = await publishSongCatalog("chunithm");
    const object = putObject.mock.calls.find(([object]) => object.key === songCatalogKey("chunithm", "jp", 9))?.[0];
    expect(JSON.parse(object.body)).toMatchObject({ game: "chunithm", songs: [{ addedVersion: null, levelPrecise: 133, metadata }] });
    expect(putObject.mock.calls.every(([object]) => object.key.startsWith(catalogPrefix("chunithm")))).toBe(true);
    expect(result.songCount).toBe(1);
  });

  it("deduplicates parents, emits composite IDs and overwrites empty slices", async () => {
    readRows.mockResolvedValue([{ parent, instance }, { parent, instance: { ...instance, gameVersion: 12 } }]);
    const result = await publishSongCatalog("maimai");
    const objects = new Map(putObject.mock.calls.map(([object]) => [object.key, JSON.parse(object.body)]));
    expect(objects.get(`${catalogPrefix("maimai")}/parents`)).toEqual({ game: "maimai", parents: [parent] });
    expect(objects.get(songCatalogKey("maimai", "jp", 11)).songs[0].songId).toBe("Ab3xK9pQ:j11");
    expect(objects.get(songCatalogKey("maimai", "jp", -13))).toEqual({ game: "maimai", songs: [] });
    expect(result.songCount).toBe(2);
    expect(result.bytes).toBeGreaterThan(0);
  });

  it("validates every slice before writing any objects", async () => {
    readRows.mockResolvedValue([{ parent, instance: { ...instance, levelPrecise: "invalid" } }]);
    await expect(publishSongCatalog("maimai")).rejects.toThrow();
    expect(putObject).not.toHaveBeenCalled();
  });

  it("propagates publication failures and republishes all slices on retry", async () => {
    readRows.mockResolvedValue([{ parent, instance }]);
    putObject.mockRejectedValueOnce(new Error("R2 unavailable"));
    await expect(publishSongCatalog("maimai")).rejects.toThrow("R2 unavailable");
    putObject.mockClear();
    await expect(publishSongCatalog("maimai")).resolves.toMatchObject({ songCount: 1 });
    expect(putObject.mock.calls.some(([object]) => object.key === songCatalogKey("maimai", "jp", 11))).toBe(true);
  });
});
