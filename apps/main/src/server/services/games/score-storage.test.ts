import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ rows: [] as unknown[][], statements: [] as { sql: string; params: unknown[] }[], withoutRankings: false, warn: vi.fn() }));
vi.mock("@/lib/db", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  return { db: drizzle(async (sql, params) => {
    state.statements.push({ sql, params });
    return { rows: state.rows };
  }) };
});
vi.mock("@/lib/request-logger", () => ({ getLogger: () => ({ warn: state.warn }) }));
vi.mock("@/lib/games/registry", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/games/registry")>();
  return { ...actual, getGame: (id: Parameters<typeof actual.getGame>[0]) => {
    const definition = actual.getGame(id);
    return state.withoutRankings ? { ...definition, capabilities: definition.capabilities.filter(capability => capability !== "rankings") } : definition;
  } };
});
import { getTableColumns } from "drizzle-orm";
import { db } from "@/lib/db";
import { songs } from "@/lib/db/schema-pg";
import { RANKING_BUCKET_CODE } from "@/lib/games/codes";
import { buildChartResolution, writeSnapshotScores, type DbSong } from "./score-storage";

beforeEach(() => { state.rows = []; state.statements = []; state.withoutRankings = false; state.warn.mockClear(); });

const catalogColumns = Object.keys({ ...getTableColumns(songs), songName: null, difficulty: null, type: null });

function song(id: number, songName: string, difficulty = 3) {
  const values: Record<string, unknown> = {
    id: String(id), parentId: String(id), game: "maimai", level: "14", levelPrecise: 140, region: "jp", gameVersion: 14, addedVersion: 14,
    songName, difficulty, type: 0,
  };
  return catalogColumns.map(column => values[column] ?? null);
}

it("excludes every ambiguous chart while keeping distinct difficulties and the original rows", async () => {
  state.rows = [song(1, "Shared"), song(2, "Shared"), song(3, "Shared"), song(4, "Shared", 2)];
  const { chartResolution, songsById } = await buildChartResolution(db, "maimai", "jp", 14);
  expect(chartResolution.has("Shared|3|0")).toBe(false);
  expect(chartResolution.get("Shared|2|0")).toBe(BigInt(4));
  expect(songsById.size).toBe(4);
  expect(state.warn).toHaveBeenCalledExactlyOnceWith(
    { songKeys: ["Shared|3|0"], game: "maimai", region: "jp", version: 14 },
    "Ambiguous song names excluded from score lookup",
  );
});

it.each(["maimai", "chunithm"] as const)("scopes chart lookup SQL to %s, region and captured version", async game => {
  await buildChartResolution(db, game, "jp", 14);
  const query = state.statements[0];
  expect(query.sql).toMatch(/"songs"\."game" = \$1 and "songs"\."region" = \$2 and "songs"\."gameVersion" = \$3/);
  expect(query.params).toEqual([game, "jp", 14]);
  expect(state.warn).not.toHaveBeenCalled();
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
  const scores = [
    snapshotScore(2, 8, 1000000),
    snapshotScore(1, 9, 1009000),
    snapshotScore(1, 9, 1009000),
    snapshotScore(3, 9, 1007500),
    snapshotScore(4, 8, 0),
  ];
  const storedRows = [[31, "1", 1009000, 0, 0, 0, 0], [32, "2", 1000000, 0, 0, 0, 0], [33, "3", 1007500, 0, 0, 0, 0], [34, "4", 0, 0, 0, 0, 0]];
  const input = { game: "chunithm" as const, snapshotId: 5, gameVersion: 9, scores };

  it("upserts each distinct score once in lock order and links it once, zero values included", async () => {
    state.rows = storedRows;
    await writeSnapshotScores(db, input);
    const upsert = state.statements[0];
    expect(upsert.params).toEqual([
      "chunithm", BigInt(1), 1009000, 0, 0, 0, 0,
      "chunithm", BigInt(2), 1000000, 0, 0, 0, 0,
      "chunithm", BigInt(3), 1007500, 0, 0, 0, 0,
      "chunithm", BigInt(4), 0, 0, 0, 0, 0,
    ]);
    expect(upsert.sql).toContain('on conflict ("songId","scoreValue","secondaryScore","comboStatus","syncStatus","clearStatus")');
    expect(insertedRows("snapshot_scores")).toEqual([32, 31, 33, 34].map(scoreId => ({ game: "chunithm", snapshotId: 5, scoreId })));
  });

  it("ranks the stored scores into the game's buckets, numbering each from zero", async () => {
    state.rows = storedRows;
    const ranking = await writeSnapshotScores(db, input);
    expect(ranking?.newScores.map(score => [score.scoreId, score.rating])).toEqual([[31, 1615], [33, 1600]]);
    expect(ranking?.oldScores.map(score => [score.scoreId, score.rating])).toEqual([[32, 1500], [34, 0]]);
    expect(insertedRows("snapshot_rankings")).toEqual([
      { game: "chunithm", snapshotId: 5, bucket: RANKING_BUCKET_CODE.new, rank: 0, scoreId: 31 },
      { game: "chunithm", snapshotId: 5, bucket: RANKING_BUCKET_CODE.new, rank: 1, scoreId: 33 },
      { game: "chunithm", snapshotId: 5, bucket: RANKING_BUCKET_CODE.old, rank: 0, scoreId: 32 },
      { game: "chunithm", snapshotId: 5, bucket: RANKING_BUCKET_CODE.old, rank: 1, scoreId: 34 },
    ]);
  });

  it("stores scores without rankings for a game that has none", async () => {
    state.withoutRankings = true;
    state.rows = storedRows;
    await expect(writeSnapshotScores(db, input)).resolves.toBeNull();
    expect(insertedRows("snapshot_scores")).toHaveLength(4);
    expect(insertedRows("snapshot_rankings")).toEqual([]);
  });

  it("ranks nothing when no score was stored", async () => {
    await expect(writeSnapshotScores(db, { ...input, scores: [] })).resolves.toBeNull();
    expect(insertedRows("snapshot_rankings")).toEqual([]);
  });
});
