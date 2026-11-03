import { beforeEach, expect, it, vi } from "vitest";

const proxy = await vi.hoisted(async () => (await import("@/test/pg-proxy")).createProxyDb());
const log = vi.hoisted(() => ({ debug: vi.fn(), error: vi.fn(), warn: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: proxy.db }));
vi.mock("@/lib/logger", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/logger")>()), logger: log }));

import { FETCH_STATES } from "@/lib/fetch-states";
import { appendFetchState } from "./fetch-progress";

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
  expect(proxy.updated("fetch_sessions")).toEqual([{ values: { statusStates: "login,player_data" }, where: [BigInt(17), "pending"] }]);
});

it("warns once with the session and state when the session is gone or no longer pending", async () => {
  proxy.answer(() => []);
  await appendFetchState(BigInt(17), FETCH_STATES.PLAYER_DATA);
  expect(proxy.queries).toHaveLength(1);
  expect(log.warn).toHaveBeenCalledExactlyOnceWith({ state: "player_data" }, "Fetch session row 17 not found or no longer pending");
});
