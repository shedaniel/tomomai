import { beforeEach, describe, expect, it, vi } from "vitest";
import pino from "pino";
import { conflictCopiedColumns, insertedRows, type ProxyQuery, type ProxyRow } from "@/test/pg-proxy";
import { INSTANCE_UPDATE_COLUMNS } from "../columns";
import { CATALOG_WRITE_LOCK_ID } from "../lock";
import type { CatalogChart } from "../schema";

const proxy = await vi.hoisted(async () => (await import("@/test/pg-proxy")).createProxyDb());
vi.mock("@/lib/db", () => ({ db: proxy.db }));
import { persistCatalog } from ".";

const log = pino({ enabled: false });
const REFERENCING_TABLES = ["score_data", "user_recent_songs", "user_albums"];
const chart: CatalogChart = { game: "chunithm", songName: "Song", chartType: 0, difficulty: 4,
  artist: "Artist", cover: "image", genre: "Original", level: "14+", levelPrecise: 145, addedVersion: 8, metadata: { source: { provider: "otoge-db", id: "123" } } };
const storedRow = { id: BigInt(12), parentId: BigInt(5), game: "chunithm", songName: "Song", type: 0,
  difficulty: 4, artist: "Artist", cover: "image", genre: "Original", level: "14+", levelPrecise: 145,
  addedVersion: 8, bpm: null, noteDesigner: null, tapCount: null, metadata: chart.metadata };

// The stored slice of the requested game, region and version, with no other instances or candidate parents,
// and the user rows that reference its charts.
const stored = { slice: [] as ProxyRow[], references: 0, nextParentId: BigInt(100) };
function answer({ sql, table, params }: ProxyQuery): ProxyRow[] | undefined {
  if (sql.startsWith('insert into "parent_song"')) return insertedRows({ sql, params }).map(row => ({ ...row, id: stored.nextParentId++ }));
  if (sql.startsWith("delete")) return params.map(id => ({ id })).filter(row => typeof row.id === "bigint");
  if (!sql.startsWith("select")) return undefined;
  if (sql.endsWith(" for update")) return params.map(id => ({ id }));
  if (table === "songs" && params.includes("jp") && params.includes(9)) return stored.slice;
  if (table === "score_data" && stored.references > 0) return params.map(songId => ({ songId, count: stored.references }));
  return [];
}
const writes = () => proxy.queries.filter(query => !query.sql.startsWith("select"));
const deletes = () => proxy.queries.filter(query => query.sql.startsWith("delete"));

beforeEach(() => {
  proxy.reset();
  proxy.answer(answer);
  Object.assign(stored, { slice: [], references: 0, nextParentId: BigInt(100) });
});

describe("catalog persistence", () => {
  it("takes the catalog write lock before reading the stored slice", async () => {
    await persistCatalog("chunithm", "jp", 9, [chart], "noop", log);
    expect(proxy.transactions).toEqual(["begin", "commit"]);
    expect(proxy.queries[0].sql).toBe(`select pg_advisory_xact_lock(${CATALOG_WRITE_LOCK_ID})`);
  });

  it("inserts a full new catalog within the driver parameter limit without losing parent assignments", async () => {
    const catalog = Array.from({ length: 7000 }, (_, index) => ({ ...chart, songName: `Song ${index}` }));
    const result = await persistCatalog("chunithm", "jp", 9, catalog, "alter", log);
    expect(result.applied).toMatchObject({ added: catalog.length, newParents: catalog.length });
    for (const write of writes()) expect(write.params.length).toBeLessThan(65_534);

    const parents = proxy.inserted("parent_song");
    const children = proxy.inserted("songs");
    expect(parents).toHaveLength(catalog.length);
    expect(children).toHaveLength(catalog.length);
    const parentIdByName = new Map(parents.map((parent, index) => [parent.songName, BigInt(index + 100)]));
    expect(children.map(child => child.parentId)).toEqual(catalog.map(song => parentIdByName.get(song.songName)));
    expect(new Set(children.map(child => child.parentId)).size).toBe(catalog.length);
  });

  it.each(["maimai", "chunithm"] as const)("binds the requested %s catalog slice and numeric fields to storage", async game => {
    const row = { ...chart, game, ...(game === "maimai" ? { chartType: 1, levelPrecise: 145, addedVersion: 8 } : {}) };
    const result = await persistCatalog(game, "jp", 9, [row], "alter", log);
    expect(result.applied).toMatchObject({ added: 1, newParents: 1 });
    expect(proxy.queries[1]).toMatchObject({ table: "songs", params: [game, "jp", 9] });
    expect(proxy.inserted("parent_song")).toEqual([expect.objectContaining({ game, type: row.chartType, difficulty: 4 })]);
    expect(proxy.inserted("songs")).toEqual([expect.objectContaining({ game, parentId: BigInt(100),
      levelPrecise: row.levelPrecise, addedVersion: row.addedVersion, metadata: JSON.stringify(chart.metadata) })]);
    const upsert = writes().find(query => query.table === "songs")!;
    expect(conflictCopiedColumns(upsert).toSorted()).toEqual([...INSTANCE_UPDATE_COLUMNS].toSorted());
    expect(result.affected).toEqual([{ songName: "Song", artist: "Artist", chartType: row.chartType }]);
  });

  it("writes nothing on an unchanged refresh", async () => {
    stored.slice = [storedRow];
    const result = await persistCatalog("chunithm", "jp", 9, [chart], "alter", log);
    expect(result.changes.unchanged).toHaveLength(1);
    expect(result.statistics).toMatchObject({ inputSongs: 1, dbSongs: 1, mergedSongs: 1, unchanged: 1 });
    expect(result.affected).toEqual([]);
    expect(writes()).toEqual([]);
  });

  it("writes a modified chart into its stored parent and refreshes its pages under both artists", async () => {
    stored.slice = [{ ...storedRow, artist: "Old" }];
    const result = await persistCatalog("chunithm", "jp", 9, [{ ...chart, level: "15" }], "alter", log);
    expect(result.applied).toMatchObject({ added: 0, modified: 1, newParents: 0 });
    expect(writes().map(query => query.table)).toEqual(["songs"]);
    expect(proxy.inserted("songs")).toEqual([expect.objectContaining({ parentId: BigInt(5), level: "15" })]);
    expect(result.affected).toEqual([
      { songName: "Song", artist: "Old", chartType: 0 },
      { songName: "Song", artist: "Artist", chartType: 0 },
    ]);
  });

  it("previews a noop upload without writing", async () => {
    stored.slice = [{ ...storedRow, level: "14" }];
    const result = await persistCatalog("chunithm", "jp", 9, [chart, { ...chart, songName: "New" }], "noop", log);
    expect(result.changes).toMatchObject({ added: [{ songName: "New" }], modified: [{ dbId: "12" }] });
    expect(result.applied).toEqual({ added: 0, modified: 0, deleted: 0, newParents: 0, parentUpdates: 0 });
    expect(result.affected).toEqual([]);
    expect(writes()).toEqual([]);
  });

  it("rejects unresolved collisions before destructive changes", async () => {
    stored.slice = [{ ...storedRow, artist: "A" }, { ...storedRow, id: BigInt(13), parentId: BigInt(6), artist: "B" }];
    await expect(persistCatalog("chunithm", "jp", 9, [chart], "destructive", log)).rejects.toThrow("Ambiguous catalog identity");
    expect(writes()).toEqual([]);
    expect(proxy.transactions).toEqual(["begin", "rollback"]);
  });

  it.each([
    { mode: "noop", references: 1, deleted: false },
    { mode: "alter", references: 1, deleted: false },
    { mode: "alter", references: 0, deleted: true },
    { mode: "destructive", references: 1, deleted: true },
  ] as const)("protects referenced charts in $mode mode with $references references", async ({ mode, references, deleted }) => {
    Object.assign(stored, { slice: [storedRow], references });
    const result = await persistCatalog("chunithm", "jp", 9, [], mode, log);
    expect(result.applied.deleted).toBe(deleted ? 1 : 0);
    expect(result.changes.deleted).toEqual([expect.objectContaining({ dbId: "12", playRecordCount: references })]);
    expect(result.appliedDeletions.map(change => change.dbId)).toEqual(deleted ? ["12"] : []);
    expect(result.skippedDeletions.map(change => change.dbId)).toEqual(references && mode !== "destructive" ? ["12"] : []);
    expect(result.affected).toEqual(deleted ? [{ songName: "Song", artist: "Artist", chartType: 0 }] : []);
    expect(proxy.queries.filter(query => REFERENCING_TABLES.includes(query.table ?? "")).map(query => [query.table, query.params]))
      .toEqual(REFERENCING_TABLES.map(table => [table, [BigInt(12)]]));
    expect(deletes().map(query => query.params)).toEqual(deleted ? [["chunithm", BigInt(12)]] : []);
    // The row locks and the deletion guard are SQL that only a database evaluates, so the statements are the contract.
    expect(proxy.queries.some(query => query.sql.endsWith(" for update"))).toBe(true);
    if (deleted) {
      const [removal] = deletes();
      expect(removal.sql.includes("not exists")).toBe(mode === "alter");
      if (mode === "alter") for (const table of REFERENCING_TABLES) {
        expect(removal.sql).toContain(`from "${table}" where "${table}"."songId" = "songs"."id"`);
      }
    }
  });
});
