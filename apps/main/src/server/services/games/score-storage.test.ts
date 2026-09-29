import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ rows: [] as unknown[][], statements: [] as { sql: string; params: unknown[] }[], withoutRankings: false }));
vi.mock("@/lib/db", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  return { db: drizzle(async (sql, params) => {
    state.statements.push({ sql, params });
    return { rows: state.rows };
  }) };
});
vi.mock("@/lib/games/registry", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/games/registry")>();
  return { ...actual, getGame: (id: Parameters<typeof actual.getGame>[0]) => {
    const definition = actual.getGame(id);
    return state.withoutRankings ? { ...definition, capabilities: definition.capabilities.filter(capability => capability !== "rankings") } : definition;
  } };
});
import { db } from "@/lib/db";
import type { snapshotRankings } from "@/lib/db/schema-pg";
import { RANKING_BUCKET_CODE } from "@/lib/games/codes";
import { buildChartResolution, buildRankingRows, scoreDataKey, upsertScoreData, writeSnapshotScores, type DbSong } from "./score-storage";

beforeEach(() => { state.rows = []; state.statements = []; state.withoutRankings = false; });

function song(id: number, name: string, difficulty = 3) {
  return [String(id), String(id), "maimai", null, "14", 140, "jp", 14, 14, null, null, null, null, null, null, name, difficulty, 0];
}

it("excludes every ambiguous chart while keeping distinct difficulties and the original rows", async () => {
  state.rows = [song(1, "Shared"), song(2, "Shared"), song(3, "Shared"), song(4, "Shared", 2)];
  const { chartResolution, songsById } = await buildChartResolution(db, "maimai", "jp", 14);
  expect(chartResolution.has("Shared|3|0")).toBe(false);
  expect(chartResolution.get("Shared|2|0")).toBe(BigInt(4));
  expect(songsById.size).toBe(4);
});

it.each(["maimai", "chunithm"] as const)("scopes chart lookup SQL to %s, region and captured version", async game => {
  await buildChartResolution(db, game, "jp", 14);
  const query = state.statements[0];
  expect(query.sql).toMatch(/"songs"\."game" = \$1 and "songs"\."region" = \$2 and "songs"\."gameVersion" = \$3/);
  expect(query.params).toEqual([game, "jp", 14]);
});

it("deduplicates score writes and uses deterministic lock ordering while retaining zero values", async () => {
  const score = { songId: BigInt(7), scoreValue: 0, secondaryScore: 0, comboStatus: 0, syncStatus: 0, clearStatus: 0 };
  const later = { ...score, songId: BigInt(9), scoreValue: 1009000 };
  state.rows = [[1, "7", 0, 0, 0, 0, 0], [2, "9", 1009000, 0, 0, 0, 0]];
  const ids = await upsertScoreData(db, "chunithm", [later, score, score]);
  expect(ids.get(scoreDataKey(score))).toBe(1);
  expect(ids.get(scoreDataKey(later))).toBe(2);
  const query = state.statements[0];
  expect(query.params).toEqual(["chunithm", BigInt(7), 0, 0, 0, 0, 0, "chunithm", BigInt(9), 1009000, 0, 0, 0, 0]);
  expect(query.sql).toContain('on conflict ("songId","scoreValue","secondaryScore","comboStatus","syncStatus","clearStatus")');
});

it("numbers each bucket's ranking rows from zero, new charts first", () => {
  expect(buildRankingRows("chunithm", 5, { newScores: [{ scoreId: 11 }, { scoreId: 12 }], oldScores: [{ scoreId: 21 }] })).toEqual([
    { game: "chunithm", snapshotId: 5, bucket: RANKING_BUCKET_CODE.new, rank: 0, scoreId: 11 },
    { game: "chunithm", snapshotId: 5, bucket: RANKING_BUCKET_CODE.new, rank: 1, scoreId: 12 },
    { game: "chunithm", snapshotId: 5, bucket: RANKING_BUCKET_CODE.old, rank: 0, scoreId: 21 },
  ] satisfies (typeof snapshotRankings.$inferInsert)[]);
});

function insertedRows(table: string) {
  const insert = state.statements.find(query => query.sql.startsWith(`insert into "${table}"`));
  if (!insert) return [];
  const columns = /^insert into "[^"]+" \(([^)]+)\) values/.exec(insert.sql)![1].split(", ").map(column => column.slice(1, -1));
  return Array.from({ length: insert.params.length / columns.length }, (_, row) =>
    Object.fromEntries(columns.map((column, index) => [column, insert.params[row * columns.length + index]])));
}

function snapshotScore(songId: number, addedVersion: number, scoreValue: number) {
  const song = { id: BigInt(songId), addedVersion, levelPrecise: 140, difficulty: 3 } as DbSong;
  return { song, values: { songId: song.id, scoreValue, secondaryScore: 0, comboStatus: 0, syncStatus: 0, clearStatus: 0 } };
}

describe("writeSnapshotScores", () => {
  const scores = [snapshotScore(1, 9, 1009000), snapshotScore(1, 9, 1009000), snapshotScore(2, 8, 1000000)];
  const input = { game: "chunithm" as const, snapshotId: 5, gameVersion: 9, scores };

  it("links each stored score once and ranks it into the game's buckets", async () => {
    state.rows = [[31, "1", 1009000, 0, 0, 0, 0], [32, "2", 1000000, 0, 0, 0, 0]];
    const ranking = await writeSnapshotScores(db, input);
    expect(ranking?.newScores.map(score => [score.scoreId, score.rating])).toEqual([[31, 1615]]);
    expect(ranking?.oldScores.map(score => [score.scoreId, score.rating])).toEqual([[32, 1500]]);
    expect(insertedRows("snapshot_scores")).toEqual([
      { game: "chunithm", snapshotId: 5, scoreId: 31 },
      { game: "chunithm", snapshotId: 5, scoreId: 32 },
    ]);
    expect(insertedRows("snapshot_rankings")).toEqual([
      { game: "chunithm", snapshotId: 5, bucket: RANKING_BUCKET_CODE.new, rank: 0, scoreId: 31 },
      { game: "chunithm", snapshotId: 5, bucket: RANKING_BUCKET_CODE.old, rank: 0, scoreId: 32 },
    ]);
  });

  it("stores scores without rankings for a game that has none", async () => {
    state.withoutRankings = true;
    state.rows = [[31, "1", 1009000, 0, 0, 0, 0], [32, "2", 1000000, 0, 0, 0, 0]];
    await expect(writeSnapshotScores(db, input)).resolves.toBeNull();
    expect(insertedRows("snapshot_scores")).toHaveLength(2);
    expect(insertedRows("snapshot_rankings")).toEqual([]);
  });

  it("ranks nothing when no score was stored", async () => {
    await expect(writeSnapshotScores(db, { ...input, scores: [] })).resolves.toBeNull();
    expect(insertedRows("snapshot_rankings")).toEqual([]);
  });
});
