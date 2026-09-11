import { beforeEach, describe, expect, it, vi } from "vitest";

const { readRows, putObject } = vi.hoisted(() => ({ readRows: vi.fn(), putObject: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: {
  transaction: (fn: (tx: unknown) => Promise<unknown>) => fn({
    execute: vi.fn(),
    select: () => ({ from: () => ({ leftJoin: () => ({ orderBy: readRows }) }) }),
  }),
} }));
vi.mock("@tomomai/server/r2", () => ({ putR2Object: putObject }));
import { publishPublicCatalog } from "./song-catalog";
import { songCatalogKey, CATALOG_R2_PREFIX } from "@/lib/api/catalog-location";

const parent = {
  songId: "Ab3xK9pQ", songName: "Test", artist: "Artist", cover: null,
  type: "dx", genre: "maimai", difficulty: "master", bpm: 180, disambiguator: 0,
};
const instance = {
  level: "13", levelPrecise: 133, region: "jp", gameVersion: 11, addedVersion: 10, noteDesigner: null,
};

beforeEach(() => {
  readRows.mockReset(); putObject.mockReset(); putObject.mockResolvedValue(undefined);
});

describe("publishSongCatalog", () => {
  it("deduplicates parents, emits composite IDs and overwrites empty slices", async () => {
    readRows.mockResolvedValue([{ parent, instance }, { parent, instance: { ...instance, gameVersion: 12 } }]);
    const result = await publishPublicCatalog({ select: () => ({ from: () => ({ leftJoin: () => ({ orderBy: readRows }) }) }) } as unknown as Parameters<typeof publishPublicCatalog>[0]);
    const objects = new Map(putObject.mock.calls.map(([object]) => [object.key, JSON.parse(object.body)]));
    expect(objects.get(`${CATALOG_R2_PREFIX}/parents`)).toEqual({ parents: [parent] });
    expect(objects.get(songCatalogKey("jp", 11)).songs[0].songId).toBe("Ab3xK9pQ:j11");
    expect(objects.get(songCatalogKey("jp", -13))).toEqual({ songs: [] });
    expect(result.songCount).toBe(2);
    expect(result.bytes).toBeGreaterThan(0);
  });

  it("validates every slice before writing any objects", async () => {
    readRows.mockResolvedValue([{ parent, instance: { ...instance, levelPrecise: "invalid" } }]);
    await expect(publishPublicCatalog({ select: () => ({ from: () => ({ leftJoin: () => ({ orderBy: readRows }) }) }) } as unknown as Parameters<typeof publishPublicCatalog>[0])).rejects.toThrow();
    expect(putObject).not.toHaveBeenCalled();
  });

  it("propagates publication failures and republishes all slices on retry", async () => {
    readRows.mockResolvedValue([{ parent, instance }]);
    putObject.mockRejectedValueOnce(new Error("R2 unavailable"));
    await expect(publishPublicCatalog({ select: () => ({ from: () => ({ leftJoin: () => ({ orderBy: readRows }) }) }) } as unknown as Parameters<typeof publishPublicCatalog>[0])).rejects.toThrow("R2 unavailable");
    putObject.mockClear();
    await expect(publishPublicCatalog({ select: () => ({ from: () => ({ leftJoin: () => ({ orderBy: readRows }) }) }) } as unknown as Parameters<typeof publishPublicCatalog>[0])).resolves.toMatchObject({ songCount: 1 });
    expect(putObject.mock.calls.some(([object]) => object.key === songCatalogKey("jp", 11))).toBe(true);
  });
});
