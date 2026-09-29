import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { CatalogCollectContext } from "@/server/services/catalog/ingestion/types";

const mocks = vi.hoisted(() => {
  const log = { child: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  log.child.mockReturnValue(log);
  return { log, collect: vi.fn(), login: vi.fn() };
});
vi.mock("@/server/services/catalog/ingestion/collect", async importOriginal => ({
  ...await importOriginal<typeof import("@/server/services/catalog/ingestion/collect")>(),
  collectCatalog: (game: string, ctx: CatalogCollectContext) => mocks.collect(game, ctx),
}));
vi.mock("@/server/services/games/maimai/login", () => ({ loginAndGetCookies: mocks.login }));
vi.mock("@/server/services/discord/webhook", () => ({ sendDiscordNotice: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/games/versions", () => ({ getCurrentVersion: () => 9 }));
vi.mock("@/lib/logger", () => ({ flushLogger: vi.fn() }));
vi.mock("@/lib/request-logger", () => ({
  requestLogger: () => ({ log: mocks.log, requestId: "update-test" }),
  runWithLogger: (_log: unknown, run: () => unknown) => run(),
}));

import { GET } from "./route";

const get = (query: string) => GET(new NextRequest(`https://example.test/api/admin/update?${query}`, { headers: { authorization: "Bearer admin-secret" } }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.log.child.mockReturnValue(mocks.log);
  vi.stubEnv("ADMIN_UPDATE_TOKEN", "admin-secret");
  vi.stubEnv("FRONTEND_GAME", "maimai");
  mocks.collect.mockResolvedValue([{ songName: "Example", game: "maimai" }]);
  mocks.login.mockResolvedValue("source-cookie");
});
afterEach(() => vi.unstubAllEnvs());

describe("GET /api/admin/update", () => {
  it("collects another game's catalog on this site, since it writes nothing", async () => {
    const response = await get("game=chunithm&region=jp");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, requestId: "update-test", records: [{ songName: "Example" }] });
    expect(mocks.collect).toHaveBeenCalledWith("chunithm", expect.objectContaining({ region: "jp", version: 9, session: { cookies: "" } }));
  });

  it("logs in to the maimai source for JP and keeps CN token-free", async () => {
    expect((await get("game=maimai&region=jp")).status).toBe(400);
    expect(mocks.collect).not.toHaveBeenCalled();

    expect((await get("game=maimai&region=jp&token=player-token")).status).toBe(200);
    expect(mocks.login).toHaveBeenCalledWith("jp", "player-token");
    expect(mocks.collect).toHaveBeenCalledWith("maimai", expect.objectContaining({ session: { cookies: "source-cookie" } }));

    mocks.login.mockClear();
    expect((await get("game=maimai&region=cn")).status).toBe(200);
    expect(mocks.login).not.toHaveBeenCalled();
  });
});
