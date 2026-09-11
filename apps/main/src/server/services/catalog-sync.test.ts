import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { catalogState, parentSong, songs, tourEvents, tourEventSteps } from "@/lib/db/schema-pg";

const mocks = vi.hoisted(() => ({ transaction: vi.fn(), readState: vi.fn(), invalidate: vi.fn(), log: { info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/db", () => ({ db: { transaction: mocks.transaction, select: () => ({ from: () => ({ where: mocks.readState }) }) } }));
vi.mock("@/lib/request-logger", () => ({ getLogger: () => mocks.log }));
vi.mock("next/cache", () => ({ revalidateTag: mocks.invalidate }));
import { syncCatalog } from "./catalog-sync";

const parent = { id: "9007199254740993", publicId: "abcdefgh", songName: "Link", artist: "A", genre: "", cover: "covers/link.webp", bpm: null, type: "std", difficulty: "master", disambiguator: 0 };
const song = { id: "9007199254740994", parentId: parent.id, region: "jp", gameVersion: 25, addedVersion: 1, level: "13", levelPrecise: 130, noteDesigner: null, tapCount: null, holdCount: null, slideCount: null, touchCount: null, breakCount: null };
const artifact = { schemaVersion: 1, sequence: 2, generatedAt: "2026-09-12T00:00:00Z", parents: [parent], songs: [song], tourEvents: [], tourEventSteps: [] };
const compressed = gzipSync(JSON.stringify(artifact));
const sha256 = createHash("sha256").update(compressed).digest("hex");
const manifest = { schemaVersion: 1, sequence: 2, generatedAt: artifact.generatedAt, sha256, url: "https://example.test/catalog.gz", counts: { parents: 1, songs: 1, tourEvents: 0 } };

function transaction(state?: { sequence: number; sha256: string }, localSongs: unknown[] = [], localParents: unknown[] = []) {
  const operations: { action: string; table?: unknown; sql?: string; values?: any; set?: any }[] = [];
  const dialect = new PgDialect();
  const tx = {
    execute: async (query: any) => { operations.push({ action: "lock", sql: dialect.sqlToQuery(query).sql }); },
    select: () => ({ from: (table: any) => {
      let condition = sql`true`;
      const rows = table === catalogState ? (persistedState ? [persistedState] : []) : table === parentSong ? localParents : table === songs ? localSongs : [];
      const builder: any = {
        where: (where: any) => { condition = where; return builder; },
        for: () => { operations.push({ action: "row-lock", table }); return builder; },
        then: (resolve: any, reject: any) => Promise.resolve(rows).then(resolve, reject),
        getSQL: () => sql`select * from ${table} where ${condition}`,
      };
      return builder;
    } }),
    insert: (table: any) => {
      const builder = {
        overridingSystemValue: () => builder,
        values: (values: any) => ({ onConflictDoUpdate: async ({ set }: any) => { operations.push({ action: "insert", table, values, set }); } }),
      };
      return builder;
    },
    delete: (table: any) => ({ where: (where: any) => {
      operations.push({ action: "delete", table, sql: dialect.sqlToQuery(where).sql });
      return { then: (resolve: any, reject: any) => Promise.resolve([]).then(resolve, reject), returning: async () => [] };
    } }),
  };
  const persistedState = state ? { ...state, sourceUrl: "https://example.test/catalog/latest.json" } : undefined;
  mocks.readState.mockResolvedValue(persistedState ? [persistedState] : []);
  mocks.transaction.mockImplementation((callback: any) => callback(tx));
  return operations;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CATALOG_URL", "https://example.test");
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string) => url.endsWith("latest.json")
    ? Response.json(manifest) : new Response(compressed)));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("catalog sync transaction", () => {
  it("preserves bigint IDs and protects removed user-referenced songs", async () => {
    const operations = transaction(undefined, [{ id: BigInt(7), parentId: BigInt(8), region: "intl", gameVersion: 25 }]);
    expect(await syncCatalog()).toMatchObject({ skipped: false, deletedSongs: 0, keptOrphanSongs: 1 });
    expect(operations[0].sql).toContain("pg_advisory_xact_lock");
    const inserted = operations.find(op => op.action === "insert" && op.table === songs)!;
    expect(inserted.values[0].id).toBe(BigInt(song.id));
    expect(inserted.set).not.toHaveProperty("parentId");
    expect(inserted.set).not.toHaveProperty("region");
    const deletionIndex = operations.findIndex(op => op.action === "delete" && op.table === songs);
    expect(operations.slice(0, deletionIndex).some(op => op.action === "row-lock" && op.table === songs)).toBe(true);
    for (const table of ["score_data", "user_recent_songs", "user_albums"]) expect(operations[deletionIndex].sql).toContain(table);
    expect(operations[deletionIndex].sql?.match(/not exists/g)).toHaveLength(3);
    for (const table of [tourEvents, tourEventSteps]) expect(operations.find(op => op.action === "delete" && op.table === table)?.sql).toBe("true");
    expect(mocks.invalidate).toHaveBeenCalledTimes(3);
  });

  it("rejects rollback checked under the transaction lock before writing", async () => {
    const operations = transaction({ sequence: 3, sha256 });
    mocks.readState.mockResolvedValue([]);
    await expect(syncCatalog({ force: true })).rejects.toThrow("rollback");
    expect(operations.map(op => op.action)).toEqual(["lock"]);
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });

  it("rejects local identity conflicts before any catalog writes", async () => {
    const operations = transaction(undefined, [], [{ ...parent, id: BigInt(parent.id), publicId: "different" }]);
    await expect(syncCatalog()).rejects.toThrow("identity changed");
    expect(operations.some(op => op.action === "insert" || op.action === "delete")).toBe(false);
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });

  it("refuses a configured source change before fetching or writing the artifact", async () => {
    transaction({ sequence: 1, sha256 });
    mocks.readState.mockResolvedValue([{ sequence: 1, sha256, sourceUrl: "https://other.test/catalog/latest.json" }]);
    await expect(syncCatalog({ force: true })).rejects.toThrow("switch catalog source");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });

  it("invalidates an unchanged retry without replaying database writes", async () => {
    const operations = transaction({ sequence: 2, sha256 });
    expect(await syncCatalog()).toEqual({ skipped: true, sequence: 2 });
    expect(operations.map(op => op.action)).toEqual(["lock"]);
    expect(mocks.invalidate).toHaveBeenCalledTimes(3);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
