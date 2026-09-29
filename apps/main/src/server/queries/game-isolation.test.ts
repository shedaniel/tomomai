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
