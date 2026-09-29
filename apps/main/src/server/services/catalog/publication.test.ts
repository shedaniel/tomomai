import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { readRows, putObject, filters, execute, selection } = vi.hoisted(() => ({ readRows: vi.fn(), putObject: vi.fn(), filters: vi.fn(), execute: vi.fn(), selection: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: {
  transaction: (fn: (tx: unknown) => Promise<unknown>) => fn({
    execute,
    select: (fields: unknown) => {
      selection(fields);
      return { from: () => ({ leftJoin: (_table: unknown, join: unknown) => ({ where: (where: unknown) => { filters(join, where); return { orderBy: readRows }; } }) }) };
    },
  }),
} }));
vi.mock("@/lib/r2", () => ({ putR2Object: putObject }));
import { publishSongCatalog } from "./publication";
import { CATALOG_WRITE_LOCK_ID } from "./ingestion/lock";
import { CATALOG_INSTANCE_FIELDS } from "./ingestion/schema";
import { parentCatalogKey, songCatalogKey } from "@/lib/api/catalog-location";

const parent = {
  songId: "Ab3xK9pQ", songName: "Test", artist: "Artist", cover: null,
  type: 1, genre: "maimai", difficulty: 3, bpm: 180, disambiguator: 0,
};
const instance = {
  level: "13", levelPrecise: 133, region: "jp", gameVersion: 11, addedVersion: 10, noteDesigner: null,
};

beforeEach(() => {
  readRows.mockReset(); filters.mockReset(); execute.mockReset(); selection.mockReset(); putObject.mockReset(); putObject.mockResolvedValue(undefined);
});

describe("publishSongCatalog", () => {
  it("publishes a configured catalog while the game's public frontend remains disabled", async () => {
    const metadata = { levelPreciseEstimated: true, addedVersionEstimated: true, source: { provider: "otoge-db", id: "2490" }, noteCounts: { air: 331 } };
    readRows.mockResolvedValue([{ parent: { ...parent, type: 0 }, instance: { ...instance, gameVersion: 9, addedVersion: 8, metadata } }]);
    const result = await publishSongCatalog("chunithm");
    const object = putObject.mock.calls.find(([object]) => object.key === songCatalogKey("chunithm", "jp", 9))?.[0];
    const body = JSON.parse(object.body);
    expect(body).toMatchObject({ game: "chunithm", songs: [{ addedVersion: 8, levelPrecise: 133, levelPreciseEstimated: true, addedVersionEstimated: true }] });
    expect(body.songs[0]).not.toHaveProperty("metadata");
    expect(putObject.mock.calls.every(([object]) => object.key.startsWith("catalog/v2/chunithm/"))).toBe(true);
    expect(result.songCount).toBe(1);
    const dialect = new PgDialect();
    const [join, where] = filters.mock.calls[0].map(filter => dialect.sqlToQuery(filter));
    expect(join.sql).toContain('"songs"."game" = $1');
    expect(join.params).toEqual(["chunithm"]);
    expect(where.sql).toBe('"parent_song"."game" = $1');
    expect(where.params).toEqual(["chunithm"]);
    expect(dialect.sqlToQuery(execute.mock.calls[0][0]).sql).toBe(`select pg_advisory_xact_lock(${CATALOG_WRITE_LOCK_ID})`);
  });

  it("deduplicates parents, emits composite IDs and overwrites empty slices", async () => {
    const confirmed = { ...instance, metadata: { levelPreciseEstimated: false, addedVersionEstimated: false } };
    readRows.mockResolvedValue([{ parent, instance: confirmed }, { parent, instance: { ...instance, gameVersion: 12 } }]);
    const result = await publishSongCatalog("maimai");
    const objects = new Map(putObject.mock.calls.map(([object]) => [object.key, JSON.parse(object.body)]));
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
    readRows.mockResolvedValue([]);
    await publishSongCatalog("maimai");
    const { instance } = selection.mock.calls[0][0] as { instance: Record<string, unknown> };
    for (const field of CATALOG_INSTANCE_FIELDS.filter(field => field !== "noteCounts")) expect(instance).toHaveProperty(field);
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
