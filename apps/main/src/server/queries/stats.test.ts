import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ queries: [] as { sql: string; params: unknown[] }[], responses: [] as unknown[][][] }));
vi.mock("@/lib/db", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  return { db: drizzle(async (sql, params) => {
    state.queries.push({ sql, params });
    return { rows: state.responses.shift() ?? [] };
  }) };
});

import { computeStatsForSnapshot } from "./stats";

// Rows follow the select order: scores are [scoreValue, addedVersion, difficulty, comboStatus, syncStatus, clearStatus],
// catalog charts are [addedVersion, difficulty, count].
beforeEach(() => { state.queries = []; state.responses = []; });

it("buckets maimai scores by difficulty code and counts combo and sync statuses by code", async () => {
  state.responses.push(
    [[1005000, 13, 3, 3, 4, 0], [1000000, 13, 3, 0, 0, 0], [990000, 12, 2, 1, 1, 0]],
    [[13, 3, 10], [12, 2, 5]],
  );

  await expect(computeStatsForSnapshot("maimai", 41, 13, "jp")).resolves.toStrictEqual({
    stats: {
      13: { 3: { grades: { "SSS+": 1, SSS: 1 }, statuses: { comboStatus: { 3: 1 }, syncStatus: { 4: 1 } }, total: 2 } },
      12: { 2: { grades: { SS: 1 }, statuses: { comboStatus: { 1: 1 }, syncStatus: { 1: 1 } }, total: 1 } },
    },
    totalSongs: { 13: { 3: 10 }, 12: { 2: 5 } },
  });
  const [scores, catalog] = state.queries;
  expect(scores.params).toEqual([41]);
  expect(catalog.params).toEqual(["maimai", "jp", 13]);
});

it("counts CHUNITHM clear lamps beside its combo and chain statuses", async () => {
  state.responses.push(
    [[1009500, 9, 3, 3, 1, 2], [1007500, 9, 3, 0, 0, 1], [950000, 8, 4, 0, 0, 0]],
    [[9, 3, 20]],
  );

  await expect(computeStatsForSnapshot("chunithm", 41, 9, "jp")).resolves.toStrictEqual({
    stats: {
      9: { 3: { grades: { "SSS+": 1, SSS: 1 }, statuses: { comboStatus: { 3: 1 }, syncStatus: { 1: 1 }, clearStatus: { 1: 1, 2: 1 } }, total: 2 } },
      8: { 4: { grades: { AAA: 1 }, statuses: { comboStatus: {}, syncStatus: {}, clearStatus: {} }, total: 1 } },
    },
    totalSongs: { 9: { 3: 20 } },
  });
});
