import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogChart } from "./normalize-charts";
import pino from "pino";
import { PgDialect, type PgTable, type SelectedFields } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { getTableName } from "drizzle-orm";

const state = vi.hoisted(() => ({
  selections: [] as unknown[][],
  reads: [] as { sql: string; params: unknown[] }[],
  deletes: [] as { sql: string; params: unknown[] }[],
  execute: vi.fn(),
  conflicts: vi.fn(),
  nextParentId: BigInt(100),
  writes: [] as { table: string; rows: Record<string, unknown>[]; parameterCount: number }[],
}));
vi.mock("@/lib/db", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  const queryBuilder = drizzle(async () => ({ rows: [] }));
  return { db: { transaction: async (run: (tx: unknown) => Promise<unknown>) => {
    const select = (fields?: SelectedFields) => ({ from: (table: PgTable) => {
      const builder = fields ? queryBuilder.select(fields) : queryBuilder.select();
      const query = builder.from(table);
      Object.defineProperty(query, "execute", { value: async () => {
        state.reads.push(query.toSQL());
        return state.selections.shift() ?? [];
      } });
      return query;
    } });
    const insert = (table: PgTable) => ({ values: (rows: Record<string, unknown>[]) => {
      const parameterCount = queryBuilder.insert(table).values(rows).toSQL().params.length;
      state.writes.push({ table: getTableName(table), rows, parameterCount });
      return { returning: async () => rows.map(row => ({ ...row, id: state.nextParentId++ })), onConflictDoUpdate: state.conflicts };
    } });
    const remove = (table: Parameters<typeof queryBuilder.delete>[0]) => {
      const query = queryBuilder.delete(table);
      Object.defineProperty(query, "execute", { value: async () => {
        state.deletes.push(query.toSQL());
        return [{ id: BigInt(12) }];
      } });
      return query;
    };
    return run({ select, insert, delete: remove, execute: state.execute });
  } } };
});
import { persistCatalog } from "@/server/services/catalog/ingestion/persistence";
import { CATALOG_WRITE_LOCK_ID } from "@/server/services/catalog/ingestion/lock";
import { INSTANCE_UPDATE_COLUMNS } from "@/server/services/catalog/ingestion/columns";
const log = pino({ enabled: false });
const chart: CatalogChart = { game: "chunithm", songName: "Song", chartType: 0, difficulty: 4,
  artist: "Artist", cover: "image", genre: "Original", level: "14+", levelPrecise: 145, addedVersion: 8, metadata: { otogeDb: { id: "123" } } };
beforeEach(() => { state.selections = []; state.writes = []; state.reads = []; state.deletes = []; state.nextParentId = BigInt(100); vi.clearAllMocks(); });

describe("shared catalog persistence", () => {
  it("inserts a full new catalog within the driver parameter limit without losing parent assignments", async () => {
    const catalog = Array.from({ length: 7000 }, (_, index) => ({ ...chart, songName: `Song ${index}` }));
    const result = await persistCatalog("chunithm", "jp", 9, catalog, "alter", log);
    expect(result.applied).toMatchObject({ added: catalog.length, newParents: catalog.length });
    for (const write of state.writes) expect(write.parameterCount).toBeLessThan(65_534);

    const parents = state.writes.filter(write => write.table === "parent_song").flatMap(write => write.rows);
    const children = state.writes.filter(write => write.table === "songs").flatMap(write => write.rows);
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
    expect(state.reads[0].sql).toContain('"songs"."game" = $1');
    expect(state.reads[0].sql).toContain('"songs"."region" = $2');
    expect(state.reads[0].sql).toContain('"songs"."gameVersion" = $3');
    expect(state.reads[0].params).toEqual([game, "jp", 9]);
    const update = state.conflicts.mock.calls[0][0].set;
    expect(Object.keys(update)).toEqual([...INSTANCE_UPDATE_COLUMNS]);
    expect(state.writes[0]).toMatchObject({ table: "parent_song", rows: [{ game, type: row.chartType, difficulty: 4 }] });
    expect(state.writes[1]).toMatchObject({ table: "songs", rows: [{ game, parentId: BigInt(100),
      levelPrecise: row.levelPrecise, addedVersion: row.addedVersion, metadata: chart.metadata }] });
  });

  it("preserves an existing instance and parent identity on an unchanged refresh", async () => {
    state.selections = [[{ id: BigInt(12), parentId: BigInt(5), game: "chunithm", songName: "Song", type: 0,
      difficulty: 4, artist: "Artist", cover: "image", genre: "Original", level: "14+", levelPrecise: 145,
      addedVersion: 8, bpm: null, noteDesigner: null, tapCount: null, metadata: chart.metadata }], []];
    const result = await persistCatalog("chunithm", "jp", 9, [chart], "alter", log);
    expect(result.changes.unchanged).toHaveLength(1);
    expect(result.mergedSongs[0].extras).toMatchObject({ dbId: "12", parentId: "5" });
    expect(state.writes).toHaveLength(0);
  });

  it("rejects unresolved collisions before destructive changes", async () => {
    const base = { id: BigInt(12), parentId: BigInt(5), game: "chunithm", songName: "Song", type: 0,
      difficulty: 4, cover: "image", genre: "Original", level: "14+", levelPrecise: 145,
      addedVersion: 8, bpm: null, noteDesigner: null, tapCount: null };
    state.selections = [[{ ...base, artist: "A" }, { ...base, id: BigInt(13), parentId: BigInt(6), artist: "B" }], []];
    await expect(persistCatalog("chunithm", "jp", 9, [chart], "destructive", log)).rejects.toThrow("Ambiguous catalog identity");
    expect(state.writes).toHaveLength(0);
    expect(state.deletes).toHaveLength(0);
  });

  it.each([
    { label: "reordered nested object keys", incoming: { source: { title: "Song", id: "123" }, notes: [1, 2] }, changed: false },
    { label: "omitted optional JSON values", incoming: { source: { title: "Song", id: "123", optional: undefined }, notes: [1, 2] }, changed: false },
    { label: "changed nested value", incoming: { source: { title: "Changed", id: "123" }, notes: [1, 2] }, changed: true },
    { label: "reordered array items", incoming: { source: { title: "Song", id: "123" }, notes: [2, 1] }, changed: true },
  ])("compares metadata with $label", async ({ incoming, changed }) => {
    state.selections = [[{ id: BigInt(12), parentId: BigInt(5), game: "chunithm", songName: "Song", type: 0,
      difficulty: 4, artist: "Artist", cover: "image", genre: "Original", level: "14+", levelPrecise: 145,
      addedVersion: 8, bpm: null, noteDesigner: null, tapCount: null,
      metadata: { notes: [1, 2], source: { id: "123", title: "Song" } } }], []];
    const result = await persistCatalog("chunithm", "jp", 9, [{ ...chart, metadata: incoming }], "alter", log);
    expect(result.changes.modified).toHaveLength(changed ? 1 : 0);
    expect(result.changes.unchanged).toHaveLength(changed ? 0 : 1);
    expect(state.writes).toHaveLength(changed ? 1 : 0);
    if (changed) expect(result.changes.modified[0].fieldChanges.map(change => change.field)).toEqual(["metadata"]);
  });

  it.each([
    { mode: "alter", references: 1, deleted: false },
    { mode: "alter", references: 0, deleted: true },
    { mode: "destructive", references: 1, deleted: true },
  ] as const)("protects referenced charts in $mode mode with $references references", async ({ mode, references, deleted }) => {
    const stored = { id: BigInt(12), parentId: BigInt(5), game: "chunithm", songName: "Song", type: 0,
      difficulty: 4, artist: "Artist", cover: "image", genre: "Original", level: "14+", levelPrecise: 145,
      addedVersion: 8, bpm: null, noteDesigner: null, tapCount: null };
    state.selections = [[stored], [], [{ id: BigInt(12) }], references ? [{ songId: BigInt(12), count: references }] : [], [], []];
    const result = await persistCatalog("chunithm", "jp", 9, [], mode, log);
    expect(result.applied.deleted).toBe(deleted ? 1 : 0);
    expect(state.reads.some(query => query.sql.includes('for update'))).toBe(true);
    expect(state.deletes).toHaveLength(deleted ? 1 : 0);
    if (deleted) {
      expect(state.deletes[0].sql).toContain('"songs"."game" = $1');
      expect(state.deletes[0].params).toEqual(["chunithm", BigInt(12)]);
      expect(state.deletes[0].sql.includes("not exists")).toBe(mode === "alter");
      if (mode === "alter") for (const table of ["score_data", "user_recent_songs", "user_albums"]) {
        expect(state.deletes[0].sql).toContain(`from "${table}"`);
      }
    }
    expect(new PgDialect().sqlToQuery(state.execute.mock.calls[0][0] as SQL).sql).toBe(`select pg_advisory_xact_lock(${CATALOG_WRITE_LOCK_ID})`);
  });

});
