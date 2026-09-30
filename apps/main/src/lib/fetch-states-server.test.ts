import { beforeEach, expect, it, vi } from "vitest";

const proxy = await vi.hoisted(async () => (await import("@/test/pg-proxy")).createProxyDb());
const log = vi.hoisted(() => ({ debug: vi.fn(), error: vi.fn(), warn: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: proxy.db }));
vi.mock("@/lib/request-logger", () => ({ getLogger: () => log }));

import { appendFetchState } from "./fetch-states-server";
import { calculateProgress, FETCH_STATES } from "./fetch-states";

// A session answers only a read of its id that asks for it while pending.
function storeSession(game: string) {
  proxy.answer(({ table, params }) => table === "fetch_sessions" && params.includes(BigInt(17)) && params.includes("pending")
    ? [{ statusStates: "login", game }]
    : []);
}

beforeEach(() => {
  vi.clearAllMocks();
  proxy.reset();
  storeSession("chunithm");
});

it("appends progress only while the session is pending, keyed by its id alone", async () => {
  await appendFetchState(BigInt(17), FETCH_STATES.PLAYER_DATA);
  expect(proxy.queries.map(({ table, params }) => [table, params])).toEqual([
    ["fetch_sessions", [BigInt(17), "pending", 1]],
    ["fetch_sessions", ["login,player_data", BigInt(17), "pending"]],
  ]);
  expect(log.debug).toHaveBeenCalledWith({ sessionId: "17", state: "player_data", progress: expect.any(Number) }, "Appended fetch state");
});

it.each(["maimai", "chunithm"] as const)("reports progress against the stages of the session's game, %s", async game => {
  storeSession(game);
  await appendFetchState(BigInt(17), FETCH_STATES.PLAYER_DATA);
  expect(log.debug).toHaveBeenCalledWith(
    expect.objectContaining({ progress: calculateProgress([FETCH_STATES.LOGIN, FETCH_STATES.PLAYER_DATA], game) }),
    "Appended fetch state",
  );
});

it("warns once with the session and state when the session is gone or no longer pending", async () => {
  proxy.answer(() => []);
  await appendFetchState(BigInt(17), FETCH_STATES.PLAYER_DATA);
  expect(proxy.queries).toHaveLength(1);
  expect(log.warn).toHaveBeenCalledExactlyOnceWith({ sessionId: "17", state: "player_data" }, "Fetch session not found or no longer pending");
});
