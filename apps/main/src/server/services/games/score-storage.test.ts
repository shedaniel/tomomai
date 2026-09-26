import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ rows: [] as unknown[][], statements: [] as { sql: string; params: unknown[] }[] }));
vi.mock("@/lib/db", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  return { db: drizzle(async (sql, params) => {
    state.statements.push({ sql, params });
    return { rows: state.rows };
  }) };
});
import { db } from "@/lib/db";
import { buildChartResolution, scoreDataKey, upsertScoreData } from "./score-storage";

beforeEach(() => { state.rows = []; state.statements = []; });

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
