import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ queries: [] as { sql: string; params: unknown[] }[], responses: [] as unknown[][][] }));
vi.mock("@/lib/db", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  return { db: drizzle(async (sql, params) => {
    state.queries.push({ sql, params });
    return { rows: state.responses.shift() ?? [] };
  }) };
});
vi.mock("@/lib/r2", () => ({ deleteFromR2: vi.fn(), isR2IconUrl: () => false, r2KeyFromIconUrl: vi.fn() }));
vi.mock("@/lib/request-logger", () => ({ getLogger: () => ({ info: vi.fn(), warn: vi.fn() }) }));

import { fetchUserSnapshots, fetchSnapshotData, deleteUserSnapshot } from "./snapshots";
import { fetchRecentSongs } from "./recents";
import { fetchUserAlbums } from "./albums";
import { fetchPlayerStats } from "./stats";

beforeEach(() => { state.queries = []; state.responses = []; });

it.each(["maimai", "chunithm"] as const)("adds game predicates to %s snapshot read and delete SQL", async game => {
  await fetchUserSnapshots(game, "same-user", "jp");
  await fetchSnapshotData(game, "same-user", "same-id", "jp");
  await deleteUserSnapshot(game, "same-user", "same-id", "jp");
  for (const query of state.queries) {
    expect(query.sql).toContain('"user_snapshots"."game" = $');
    expect(query.sql).toContain('"user_snapshots"."userId" = $');
    expect(query.params).toContain(game);
    expect(query.params).toContain("same-user");
  }
});

it("decodes snapshot event metadata and keeps game-specific score codes intact", async () => {
  state.responses.push(
    [[{ provider: "test" }, 1, "snapshot", "same-user", "chunithm", "jp", "2026-09-01 00:00:00", 9, 1700, null, null, null, 1, 1, "", "Player", "Title", 7]],
    [["song~jp~9", "Song", "Artist", "", 4, 1, "14+", 145, "Original", 9, 1009000, 0, 3, 0, 1]],
    [[{ steps: 10 }, null, "Map progress", null, null, null, null, null, null]],
  );
  const result = await fetchSnapshotData("chunithm", "same-user", "snapshot", "jp");
  expect(result?.snapshot.metadata).toEqual({ provider: "test" });
  expect(result?.songs[0]).toMatchObject({ difficultyCode: 4, typeCode: 1, comboStatus: 3, scoreValue: 1009000 });
  expect(result?.events[0]).toMatchObject({ name: "Map progress", metadata: { steps: 10 } });
  expect(state.queries.every(query => query.params.includes("chunithm"))).toBe(true);
});

it("includes optional metadata in recent and album reads and scopes their pagination by game", async () => {
  state.responses.push([], [[0]], []);
  await fetchRecentSongs("chunithm", "same-user", "jp", 20, 0);
  await fetchUserAlbums("chunithm", "same-user", "jp", 20, 0);
  expect(state.queries).toHaveLength(3);
  expect(state.queries[0].sql).toContain('"user_recent_songs"."metadata"');
  expect(state.queries[0].sql).toContain('"user_recent_songs"."game" = $');
  expect(state.queries[1].sql).toContain('"user_recent_songs"."game" = $');
  expect(state.queries[2].sql).toContain('"user_albums"."metadata"');
  expect(state.queries[2].sql).toContain('"user_albums"."game" = $');
  expect(state.queries.every(query => query.params.includes("chunithm"))).toBe(true);
});

it("scopes stats snapshot lookup by game before aggregating", async () => {
  await fetchPlayerStats("chunithm", "same-user", "jp");
  expect(state.queries[0].sql).toContain('"user_snapshots"."game" = $');
  expect(state.queries[0].params).toContain("chunithm");
});
