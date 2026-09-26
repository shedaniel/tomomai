import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogChart } from "./normalize-charts";
import type { Logger } from "pino";
import { getTableName } from "drizzle-orm";

const state = vi.hoisted(() => ({
  selections: [] as unknown[][],
  writes: [] as { table: string; rows: Record<string, unknown>[] }[],
  transactions: 0,
}));
vi.mock("@/lib/db", () => ({ db: { transaction: async (run: (tx: unknown) => Promise<unknown>) => {
  state.transactions++;
  const select = () => {
    const rows = state.selections.shift() ?? [];
    const builder = { from: () => builder, innerJoin: () => builder, where: () => builder,
      for: () => builder, groupBy: () => builder,
      then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows).then(resolve) };
    return builder;
  };
  const insert = (table: Parameters<typeof getTableName>[0]) => ({ values: (rows: Record<string, unknown>[]) => {
    state.writes.push({ table: getTableName(table), rows });
    return { returning: async () => rows.map((row, index) => ({ ...row, id: BigInt(index + 100) })), onConflictDoUpdate: async () => [] };
  } });
  return run({ select, insert, execute: vi.fn() });
} } }));
import { persistCatalog } from "@/server/services/catalog/ingestion/persistence";
const log = { info: vi.fn(), trace: vi.fn() } as unknown as Logger;
const chart: CatalogChart = { game: "chunithm", songName: "Song", chartType: 0, difficulty: 4,
  artist: "Artist", cover: "image", genre: "Original", level: "14+", levelPrecise: 145, addedVersion: 8, metadata: { otogeDb: { id: "123" } } };
beforeEach(() => { state.selections = []; state.writes = []; state.transactions = 0; });

describe("shared catalog persistence", () => {
  it.each(["maimai", "chunithm"] as const)("writes %s through the same numeric parent/instance pipeline", async game => {
    const row = { ...chart, game, ...(game === "maimai" ? { chartType: 1, levelPrecise: 145, addedVersion: 8 } : {}) };
    const result = await persistCatalog(game, "jp", 9, [row], "alter", log);
    expect(result.applied).toMatchObject({ added: 1, newParents: 1 });
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

  it("validates game identity before opening a transaction", async () => {
    await expect(persistCatalog("maimai", "jp", 9, [chart], "alter", log)).rejects.toThrow("different game");
    expect(state.transactions).toBe(0);
  });
});
