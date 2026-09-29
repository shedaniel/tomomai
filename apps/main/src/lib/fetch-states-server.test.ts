import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  queries: [] as { sql: string; params: unknown[] }[],
  session: [["login", "chunithm"]] as unknown[][],
  log: { debug: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));
vi.mock("@/lib/db", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  return { db: drizzle(async (sql, params) => {
    state.queries.push({ sql, params });
    return { rows: sql.startsWith("select") ? state.session : [] };
  }) };
});
vi.mock("@/lib/request-logger", () => ({ getLogger: () => state.log }));

import { appendFetchState } from "./fetch-states-server";
import { calculateProgress, FETCH_STATES } from "./fetch-states";

beforeEach(() => {
  vi.clearAllMocks();
  state.queries = [];
  state.session = [["login", "chunithm"]];
});

it("appends progress only while the session is pending, keyed by its id alone", async () => {
  await appendFetchState(BigInt(17), FETCH_STATES.PLAYER_DATA);
  expect(state.queries).toHaveLength(2);
  for (const query of state.queries) {
    expect(query.sql).toMatch(/where \("fetch_sessions"\."id" = \$\d+ and "fetch_sessions"\."status" = \$\d+\)/);
    expect(query.params).toEqual(expect.arrayContaining([BigInt(17), "pending"]));
  }
  expect(state.queries[1].params).toContain("login,player_data");
  expect(state.log.debug).toHaveBeenCalledWith({ sessionId: "17", state: "player_data", progress: expect.any(Number) }, "Appended fetch state");
});

it.each(["maimai", "chunithm"] as const)("reports progress against the stages of the session's game, %s", async game => {
  state.session = [["login", game]];
  await appendFetchState(BigInt(17), FETCH_STATES.PLAYER_DATA);
  expect(state.log.debug).toHaveBeenCalledWith(
    expect.objectContaining({ progress: calculateProgress([FETCH_STATES.LOGIN, FETCH_STATES.PLAYER_DATA], game) }),
    "Appended fetch state",
  );
});

it("warns once with the session and state when the session is gone or no longer pending", async () => {
  state.session = [];
  await appendFetchState(BigInt(17), FETCH_STATES.PLAYER_DATA);
  expect(state.queries).toHaveLength(1);
  expect(state.log.warn).toHaveBeenCalledExactlyOnceWith({ sessionId: "17", state: "player_data" }, "Fetch session not found or no longer pending");
});
