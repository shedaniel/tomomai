import { beforeEach, expect, it, vi } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { songs, userSnapshots } from "@/lib/db/schema-pg";

type Statement = { sql: string; params: unknown[]; inTransaction: boolean };
const state = vi.hoisted(() => ({
  statements: [] as Statement[],
  transactions: [] as string[],
  inTransaction: false,
  responses: {} as Record<string, unknown[][]>,
  failOn: null as string | null,
  withoutRankings: false,
}));
vi.mock("@/lib/db", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  const connection = drizzle(async (sql, params) => {
    state.statements.push({ sql, params, inTransaction: state.inTransaction });
    if (state.failOn && sql.startsWith(state.failOn)) throw new Error("insert failed");
    const key = Object.keys(state.responses).find(prefix => sql.startsWith(prefix));
    return { rows: key ? state.responses[key] : [] };
  });
  // pg-proxy has no transactions, so this records the boundary the service must stay inside.
  const transaction = async <T,>(work: (tx: typeof connection) => Promise<T>) => {
    state.transactions.push("begin");
    state.inTransaction = true;
    try {
      const result = await work(connection);
      state.transactions.push("commit");
      return result;
    } catch (err) {
      state.transactions.push("rollback");
      throw err;
    } finally {
      state.inTransaction = false;
    }
  };
  return { db: Object.assign(connection, { transaction }) };
});
vi.mock("@/lib/games/registry", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/games/registry")>();
  return { ...actual, getGame: (id: Parameters<typeof actual.getGame>[0]) => {
    const definition = actual.getGame(id);
    return state.withoutRankings ? { ...definition, capabilities: definition.capabilities.filter(capability => capability !== "rankings") } : definition;
  } };
});

import { copySnapshotToVersion } from "./snapshot-copy";

const input = { game: "maimai" as const, userId: "owner", snapshotPublicId: "source", region: "jp" as const, targetVersion: 13 };

function row<T extends Record<string, unknown>>(columns: T, values: Partial<Record<keyof T, unknown>>) {
  return Object.keys(columns).map(column => values[column] ?? null);
}

beforeEach(() => {
  state.statements = [];
  state.transactions = [];
  state.failOn = null;
  state.withoutRankings = false;
  state.responses = {
    'select "metadata", "id"': [row(getTableColumns(userSnapshots), {
      id: 1, publicId: "source", userId: "owner", game: "maimai", region: "jp", fetchedAt: "2026-09-01T00:00:00",
      gameVersion: 12, rating: 12000, versionPlayCount: 5, totalPlayCount: 50, iconUrl: "", displayName: "Player", title: "", titleType: 0,
    })],
    'insert into "user_snapshots"': [[2]],
    'select "songs"."parentId"': [["70", 1005000, 0, 0, 0, 0]],
    'select "songs"."id"': [[...row(getTableColumns(songs), {
      id: "7", parentId: "70", game: "maimai", level: "14", levelPrecise: 140, region: "jp", gameVersion: 13, addedVersion: 13,
    }), "Song", 3, 0]],
    'insert into "score_data"': [[8, "7", 1005000, 0, 0, 0, 0]],
  };
});

it("returns null without writing when the snapshot is not the user's", async () => {
  state.responses['select "metadata", "id"'] = [];
  await expect(copySnapshotToVersion({ ...input, userId: "someone-else" })).resolves.toBeNull();
  expect(state.statements).toHaveLength(1);
  expect(state.statements[0].params).toEqual(expect.arrayContaining(["source", "maimai", "someone-else", "jp"]));
  expect(state.statements.some(query => !query.sql.startsWith("select"))).toBe(false);
});

it("copies scores onto the target charts and rates the copy with the game's player rating", async () => {
  await expect(copySnapshotToVersion(input)).resolves.toEqual({
    newSnapshotId: expect.any(String), copiedScores: 1, totalOriginalScores: 1, originalRating: 12000, newRating: 315,
  });
  expect(state.transactions).toEqual(["begin", "commit"]);
  expect(state.statements.every(query => query.inTransaction)).toBe(true);
  expect(state.statements.find(query => query.sql.startsWith('insert into "user_snapshots"'))?.params).toEqual(expect.arrayContaining(["maimai", 13]));
  expect(state.statements.find(query => query.sql.startsWith('insert into "snapshot_rankings"'))?.params).toEqual(expect.arrayContaining([2, "maimai", 8]));
  expect(state.statements.find(query => query.sql.startsWith('update "user_snapshots"'))?.params).toEqual([315, 2]);
});

it("rolls the whole copy back when a write fails", async () => {
  state.failOn = 'insert into "snapshot_scores"';
  await expect(copySnapshotToVersion(input)).rejects.toThrow('Failed query: insert into "snapshot_scores"');
  expect(state.transactions).toEqual(["begin", "rollback"]);
  expect(state.statements.every(query => query.inTransaction)).toBe(true);
  expect(state.statements.some(query => query.sql.startsWith('insert into "user_snapshots"'))).toBe(true);
});

it("keeps the source rating and writes no rankings for a game without rankings", async () => {
  state.withoutRankings = true;
  await expect(copySnapshotToVersion(input)).resolves.toMatchObject({ copiedScores: 1, newRating: 12000 });
  expect(state.statements.some(query => query.sql.startsWith('insert into "snapshot_scores"'))).toBe(true);
  expect(state.statements.some(query => query.sql.startsWith('insert into "snapshot_rankings"'))).toBe(false);
  expect(state.statements.some(query => query.sql.startsWith('update "user_snapshots"'))).toBe(false);
});
