import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const proxy = await vi.hoisted(async () => (await import("@/test/pg-proxy")).createProxyDb());
const mocks = vi.hoisted(() => ({
  publish: vi.fn(), revalidate: vi.fn(),
  log: { child: () => mocks.log, info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db: proxy.db }));
vi.mock("@/lib/logger", () => ({ flushLogger: vi.fn() }));
vi.mock("@/lib/request-logger", () => ({
  requestLogger: () => ({ log: mocks.log, requestId: "normalize" }),
  runWithLogger: (_log: unknown, run: () => unknown) => run(),
}));
vi.mock("@/server/services/catalog/publication", () => ({ publishSongCatalog: mocks.publish }));
vi.mock("@/server/services/catalog/revalidation", () => ({ revalidateCatalog: mocks.revalidate }));

import { GET } from "./route";
import { CATALOG_WRITE_LOCK_ID } from "@/server/services/catalog/ingestion/lock";

const normalize = (query: string) => GET(new NextRequest(`https://example.test/api/admin/db?${query}`, {
  headers: { authorization: "Bearer admin-secret" },
}));

beforeEach(() => {
  vi.clearAllMocks();
  proxy.reset();
  vi.stubEnv("ADMIN_UPDATE_TOKEN", "admin-secret");
  vi.stubEnv("FRONTEND_GAME", "maimai");
});
afterEach(() => vi.unstubAllEnvs());

describe("GET /api/admin/db", () => {
  it("renames maimai parents with the maimai title rule under the catalog lock", async () => {
    // The slice's one parent, whose normalized title no other parent holds.
    proxy.answer(({ table, params }) => {
      if (table === "songs") return [{ parentId: "1" }];
      if (table === "parent_song") return params.includes("maimai") ? [] : [{ id: "1", songName: "Ｌｉｎｋ", type: 0, difficulty: 3, disambiguator: 0 }];
    });
    const response = await normalize("game=maimai&region=jp");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ statistics: { totalMasterNamesNormalized: 1 } });
    expect(proxy.updated("parent_song")).toEqual([{ values: { songName: "Link", disambiguator: 0 }, where: [BigInt(1)] }]);
    expect(proxy.transactions).toEqual(["begin", "commit"]);
    expect(proxy.queries[0].sql).toBe(`select pg_advisory_xact_lock(${CATALOG_WRITE_LOCK_ID})`);
    expect(mocks.publish).toHaveBeenCalledWith("maimai");
    expect(mocks.revalidate).toHaveBeenCalledWith("maimai", { log: mocks.log });
  });

  it("refuses to normalize CHUNITHM titles, which ingestion keeps as the source spells them", async () => {
    vi.stubEnv("FRONTEND_GAME", "chunithm");
    const response = await normalize("game=chunithm&region=jp&version=8");
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ code: "UNSUPPORTED_CAPABILITY" });
    expect(proxy.queries).toEqual([]);
    expect(mocks.publish).not.toHaveBeenCalled();
  });
});
