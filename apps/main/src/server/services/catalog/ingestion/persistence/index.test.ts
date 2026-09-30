import { beforeEach, describe, expect, it, vi } from "vitest";
import pino from "pino";
import { getTableName, type SQL } from "drizzle-orm";
import { PgDialect, type PgTable, type SelectedFields } from "drizzle-orm/pg-core";
import { INSTANCE_UPDATE_COLUMNS } from "../columns";
import { CATALOG_WRITE_LOCK_ID } from "../lock";
import type { CatalogChart } from "../schema";

const state = vi.hoisted(() => ({
  selections: [] as unknown[][],
  steps: [] as string[],
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
        state.steps.push("read");
        state.reads.push(query.toSQL());
        return state.selections.shift() ?? [];
      } });
      return query;
    } });
    const insert = (table: PgTable) => ({ values: (rows: Record<string, unknown>[]) => {
      const parameterCount = queryBuilder.insert(table).values(rows).toSQL().params.length;
      state.steps.push("write");
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
    const execute = (query: SQL) => {
      state.steps.push("lock");
      return state.execute(query);
    };
    return run({ select, insert, delete: remove, execute });
  } } };
});
import { persistCatalog } from ".";

const log = pino({ enabled: false });
const REFERENCING_TABLES = ["score_data", "user_recent_songs", "user_albums"];
const chart: CatalogChart = { game: "chunithm", songName: "Song", chartType: 0, difficulty: 4,
  artist: "Artist", cover: "image", genre: "Original", level: "14+", levelPrecise: 145, addedVersion: 8, metadata: { source: { provider: "otoge-db", id: "123" } } };
const storedRow = { id: BigInt(12), parentId: BigInt(5), game: "chunithm", songName: "Song", type: 0,
  difficulty: 4, artist: "Artist", cover: "image", genre: "Original", level: "14+", levelPrecise: 145,
  addedVersion: 8, bpm: null, noteDesigner: null, tapCount: null, metadata: chart.metadata };
beforeEach(() => {
  state.selections = []; state.steps = []; state.writes = []; state.reads = []; state.deletes = []; state.nextParentId = BigInt(100);
  vi.clearAllMocks();
});

describe("catalog persistence", () => {
  it("takes the catalog write lock before reading the stored slice", async () => {
    await persistCatalog("chunithm", "jp", 9, [chart], "noop", log);
    expect(state.steps[0]).toBe("lock");
    expect(new PgDialect().sqlToQuery(state.execute.mock.calls[0][0] as SQL).sql).toBe(`select pg_advisory_xact_lock(${CATALOG_WRITE_LOCK_ID})`);
  });

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
    expect(Object.keys(state.conflicts.mock.calls[0][0].set)).toEqual([...INSTANCE_UPDATE_COLUMNS]);
    expect(state.writes[0]).toMatchObject({ table: "parent_song", rows: [{ game, type: row.chartType, difficulty: 4 }] });
    expect(state.writes[1]).toMatchObject({ table: "songs", rows: [{ game, parentId: BigInt(100),
      levelPrecise: row.levelPrecise, addedVersion: row.addedVersion, metadata: chart.metadata }] });
    expect(result.affected).toEqual([{ songName: "Song", artist: "Artist", chartType: row.chartType }]);
  });

  it("writes nothing on an unchanged refresh", async () => {
    state.selections = [[storedRow], []];
    const result = await persistCatalog("chunithm", "jp", 9, [chart], "alter", log);
    expect(result.changes.unchanged).toHaveLength(1);
    expect(result.statistics).toMatchObject({ inputSongs: 1, dbSongs: 1, mergedSongs: 1, unchanged: 1 });
    expect(result.affected).toEqual([]);
    expect(state.writes).toHaveLength(0);
  });

  it("writes a modified chart into its stored parent and refreshes its pages under both artists", async () => {
    state.selections = [[{ ...storedRow, artist: "Old" }], []];
    const result = await persistCatalog("chunithm", "jp", 9, [{ ...chart, level: "15" }], "alter", log);
    expect(result.applied).toMatchObject({ added: 0, modified: 1, newParents: 0 });
    expect(state.writes).toEqual([expect.objectContaining({ table: "songs", rows: [expect.objectContaining({ parentId: BigInt(5), level: "15" })] })]);
    expect(result.affected).toEqual([
      { songName: "Song", artist: "Old", chartType: 0 },
      { songName: "Song", artist: "Artist", chartType: 0 },
    ]);
  });

  it("previews a noop upload without writing", async () => {
    state.selections = [[{ ...storedRow, level: "14" }], []];
    const result = await persistCatalog("chunithm", "jp", 9, [chart, { ...chart, songName: "New" }], "noop", log);
    expect(result.changes).toMatchObject({ added: [{ songName: "New" }], modified: [{ dbId: "12" }] });
    expect(result.applied).toEqual({ added: 0, modified: 0, deleted: 0, newParents: 0, parentUpdates: 0 });
    expect(result.affected).toEqual([]);
    expect(state.writes).toHaveLength(0);
  });

  it("rejects unresolved collisions before destructive changes", async () => {
    state.selections = [[{ ...storedRow, artist: "A" }, { ...storedRow, id: BigInt(13), parentId: BigInt(6), artist: "B" }], []];
    await expect(persistCatalog("chunithm", "jp", 9, [chart], "destructive", log)).rejects.toThrow("Ambiguous catalog identity");
    expect(state.writes).toHaveLength(0);
    expect(state.deletes).toHaveLength(0);
  });

  it.each([
    { mode: "noop", references: 1, deleted: false },
    { mode: "alter", references: 1, deleted: false },
    { mode: "alter", references: 0, deleted: true },
    { mode: "destructive", references: 1, deleted: true },
  ] as const)("protects referenced charts in $mode mode with $references references", async ({ mode, references, deleted }) => {
    state.selections = [[storedRow], [], [{ id: BigInt(12) }], references ? [{ songId: BigInt(12), count: references }] : [], [], []];
    const result = await persistCatalog("chunithm", "jp", 9, [], mode, log);
    expect(result.applied.deleted).toBe(deleted ? 1 : 0);
    expect(result.changes.deleted).toEqual([expect.objectContaining({ dbId: "12", playRecordCount: references })]);
    expect(result.appliedDeletions.map(change => change.dbId)).toEqual(deleted ? ["12"] : []);
    expect(result.skippedDeletions.map(change => change.dbId)).toEqual(references && mode !== "destructive" ? ["12"] : []);
    expect(result.affected).toEqual(deleted ? [{ songName: "Song", artist: "Artist", chartType: 0 }] : []);
    expect(state.reads.some(query => query.sql.includes("for update"))).toBe(true);
    for (const table of REFERENCING_TABLES) {
      const count = state.reads.find(query => query.sql.includes(`from "${table}"`));
      expect(count?.sql).toContain(`where "${table}"."songId" in ($1)`);
      expect(count?.params).toEqual([BigInt(12)]);
    }
    expect(state.deletes).toHaveLength(deleted ? 1 : 0);
    if (deleted) {
      expect(state.deletes[0].sql).toContain('"songs"."game" = $1');
      expect(state.deletes[0].sql.includes("not exists")).toBe(mode === "alter");
      expect(state.deletes[0].params).toEqual(["chunithm", BigInt(12)]);
      if (mode === "alter") for (const table of REFERENCING_TABLES) {
        expect(state.deletes[0].sql).toContain(`from "${table}" where "${table}"."songId" = "songs"."id"`);
      }
    }
  });
});
