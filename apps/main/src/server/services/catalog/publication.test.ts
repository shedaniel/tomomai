import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { readRows, putObject, filters } = vi.hoisted(() => ({ readRows: vi.fn(), putObject: vi.fn(), filters: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: {
  transaction: (fn: (tx: unknown) => Promise<unknown>) => fn({
    execute: vi.fn(),
    select: () => ({ from: () => ({ leftJoin: (_table: unknown, join: unknown) => ({ where: (where: unknown) => { filters(join, where); return { orderBy: readRows }; } }) }) }),
  }),
} }));
vi.mock("@/lib/r2", () => ({ putR2Object: putObject }));
import { publishSongCatalog } from "@/server/services/catalog/publication";

const parent = {
  songId: "Ab3xK9pQ", songName: "Test", artist: "Artist", cover: null,
  type: 1, genre: "maimai", difficulty: 3, bpm: 180, disambiguator: 0,
};
const instance = {
  level: "13", levelPrecise: 133, region: "jp", gameVersion: 11, addedVersion: 10, noteDesigner: null,
};

beforeEach(() => {
  readRows.mockReset(); filters.mockReset(); putObject.mockReset(); putObject.mockResolvedValue(undefined);
});

describe("publishSongCatalog", () => {
  it("publishes a configured catalog while the game's public frontend remains disabled", async () => {
    const metadata = { levelPreciseEstimated: true, addedVersionEstimated: true, otogeDb: { id: "2490" } };
    readRows.mockResolvedValue([{ parent: { ...parent, type: 0 }, instance: { ...instance, gameVersion: 9, addedVersion: 8, metadata } }]);
    const result = await publishSongCatalog("chunithm");
    const object = putObject.mock.calls.find(([object]) => object.key === "api/v1/games/chunithm/songs/jp/9")?.[0];
    expect(JSON.parse(object.body)).toMatchObject({ game: "chunithm", songs: [{ addedVersion: 8, levelPrecise: 133, metadata }] });
    expect(putObject.mock.calls.every(([object]) => object.key.startsWith("api/v1/games/chunithm/"))).toBe(true);
    expect(result.songCount).toBe(1);
    const dialect = new PgDialect();
    const [join, where] = filters.mock.calls[0].map(filter => dialect.sqlToQuery(filter));
    expect(join.sql).toContain('"songs"."game" = $1');
    expect(join.params).toEqual(["chunithm"]);
    expect(where.sql).toBe('"parent_song"."game" = $1');
    expect(where.params).toEqual(["chunithm"]);
  });

  it("deduplicates parents, emits composite IDs and overwrites empty slices", async () => {
    readRows.mockResolvedValue([{ parent, instance }, { parent, instance: { ...instance, gameVersion: 12 } }]);
    const result = await publishSongCatalog("maimai");
    const objects = new Map(putObject.mock.calls.map(([object]) => [object.key, JSON.parse(object.body)]));
    expect(objects.get("api/v1/games/maimai/parents")).toEqual({ game: "maimai", parents: [parent] });
    expect(objects.get("api/v1/games/maimai/songs/jp/11").songs[0].songId).toBe("Ab3xK9pQ:j11");
    expect(objects.get("api/v1/games/maimai/songs/jp/-13")).toEqual({ game: "maimai", songs: [] });
    expect(result.songCount).toBe(2);
    expect(result.bytes).toBeGreaterThan(0);
  });

  it("validates every slice before writing any objects", async () => {
    readRows.mockResolvedValue([{ parent, instance: { ...instance, levelPrecise: "invalid" } }]);
    await expect(publishSongCatalog("maimai")).rejects.toThrow();
    expect(putObject).not.toHaveBeenCalled();
  });

  it("rebuilds every catalog object after a publication failure", async () => {
    readRows.mockResolvedValue([{ parent, instance }]);
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
