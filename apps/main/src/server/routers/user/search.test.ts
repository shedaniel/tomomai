import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const proxy = await vi.hoisted(async () => (await import("@/test/pg-proxy")).createProxyDb());
const mocks = vi.hoisted(() => ({ limited: false }));
vi.mock("@/lib/db", () => ({ db: proxy.db }));
vi.mock("@/lib/auth", () => ({ auth: {} }));
vi.mock("@/lib/security/redis-rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/security/redis-rate-limit")>()),
  playerSearchLimiter: { check: async () => ({ limited: mocks.limited, limit: 60, remaining: 0, retryAfter: 60 }) },
}));
vi.mock("@/server/services/games/registry", () => ({ GAME_SERVER_MODULES: { maimai: {}, chunithm: {} } }));

import { searchRouter } from "./search";

const caller = searchRouter.createCaller({ req: new NextRequest("http://localhost/api/trpc"), session: null });

beforeEach(() => {
  proxy.reset();
  mocks.limited = false;
  vi.stubEnv("NEXT_PUBLIC_ENABLED_CHUNITHM_REGIONS", "intl,jp");
});

describe("searchPlayers", () => {
  it("finds only published profiles listed in search, and escapes LIKE wildcards in the query", async () => {
    proxy.answer(({ sql }) => sql.includes('from "user"') && !sql.includes("user_snapshots")
      ? [{ id: "u1", username: "shedaniel", image: null }]
      : sql.includes("distinct on") && sql.includes('"displayName"') && !sql.includes("normalize")
        ? [{ userId: "u1", displayName: "ＳＨＥＤ", rating: 1700000, iconUrl: "https://example.test/icon.png" }]
        : []);

    const results = await caller.searchPlayers({ game: "chunithm", query: "@she_d%" });

    expect(results).toEqual([{ username: "shedaniel", image: null, displayName: "ＳＨＥＤ", rating: 1700000, iconUrl: "https://example.test/icon.png" }]);
    const [byUsername] = proxy.queries;
    expect(byUsername.sql).toContain('"user"."publishProfile" =');
    expect(byUsername.sql).toContain('"user"."profileShowInSearch" =');
    expect(byUsername.params).toContain("%she\\_d%");
  });

  it("refuses a burst of searches from one client", async () => {
    mocks.limited = true;
    await expect(caller.searchPlayers({ game: "chunithm", query: "shed" })).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    expect(proxy.queries).toEqual([]);
  });
});
