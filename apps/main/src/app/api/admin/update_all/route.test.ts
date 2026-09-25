import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => {
  const log = { child: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  log.child.mockReturnValue(log);
  return { log, collect: vi.fn(), ingest: vi.fn(), publish: vi.fn(), login: vi.fn(), flush: vi.fn(), invalidate: vi.fn() };
});
vi.mock("@/lib/games/adapters/maimai", () => ({ maimaiAdapter: {
  supportedRegions: new Set(["jp", "intl", "cn"]), capabilities: new Set(["catalog"]),
  catalog: { configured: true, requiresToken: (region: string) => region !== "cn", authenticate: mocks.login },
} }));
vi.mock("@/lib/games/adapters/chunithm", () => ({ chunithmAdapter: {
  supportedRegions: new Set(["jp", "intl"]), capabilities: new Set(["rankings", "rating"]), catalog: { configured: true },
} }));
vi.mock("@/lib/games/versions", () => ({ getCurrentVersion: () => 9, getVersionInfo: () => ({ id: 9 }) }));
vi.mock("@/lib/games/frontend-server", () => ({ getFrontendGame: () => ({ id: "maimai" }) }));
vi.mock("@/server/services/games/catalog-ingestion", () => ({ collectCatalog: mocks.collect, ingestCatalog: mocks.ingest }));
vi.mock("@/server/services/admin/song-catalog", () => ({ publishSongCatalog: mocks.publish }));
vi.mock("@/server/services/admin/discord-webhooks", () => ({ sendDiscordNotice: vi.fn().mockResolvedValue(undefined), sendDiscordWebhook: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/server/services/admin/fetcher-utils", () => ({ createNoticeSink: () => ({ details: [], addDetail() {} }) }));
vi.mock("@/lib/logger", () => ({ flushLogger: mocks.flush }));
vi.mock("@/lib/request-logger", () => ({ requestLogger: () => ({ log: mocks.log, requestId: "catalog-test" }) }));
vi.mock("@/lib/song-slug", () => ({ getSongSlugs: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/utils", () => ({ sortKeys: (value: unknown) => value, awaitWrapper: async (promise: Promise<unknown>) => { try { return [await promise, null]; } catch (error) { return [null, error]; } } }));
vi.mock("next/cache", () => ({ revalidateTag: mocks.invalidate, revalidatePath: mocks.invalidate }));

import { GET } from "./route";
import { GET as collect } from "../update/route";
import { POST as upload } from "../upload/route";
import { GAME_REGISTRY, resolveGameContext } from "@/lib/games/registry";

const chart = { game: "chunithm", songName: "Example", artist: "Artist", chartType: 0, difficulty: 4, level: "14+", levelPrecise: 145, addedVersion: 9, cover: "https://example.test/cover.jpg", genre: "Original" };
function request(path: string, token: string | null = "admin-secret") {
  return new NextRequest(`https://example.test/api/admin/${path}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ADMIN_UPDATE_TOKEN", "admin-secret");
  vi.stubEnv("FRONTEND_GAME", "maimai");
  mocks.collect.mockResolvedValue([chart]);
  mocks.ingest.mockResolvedValue({ dbSongs: [], mergedSongs: [chart], changes: { added: [], modified: [], deleted: [], unchanged: [] }, applied: { added: 1, modified: 0, deleted: 0 }, mergeEvents: [], addedSongs: [chart] });
  mocks.publish.mockResolvedValue({ songCount: 1 });
  mocks.login.mockResolvedValue("source-cookie");
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    const req = new NextRequest(url, { ...init, signal: init.signal ?? undefined });
    if (req.nextUrl.pathname === "/api/admin/update") return collect(req);
    if (req.nextUrl.pathname === "/api/admin/upload") return upload(req);
    throw new Error(`Unexpected request ${req.nextUrl.pathname}`);
  }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("configured catalog admin pipeline", () => {
  it("ingests disabled CHUNITHM through update_all without a player token", async () => {
    expect(GAME_REGISTRY.chunithm.enabled).toBe(false);
    const response = await GET(request("update_all?game=chunithm&region=jp&image_upload=false"));
    expect(response.status).toBe(200);
    expect(mocks.login).not.toHaveBeenCalled();
    expect(mocks.collect).toHaveBeenCalledWith("chunithm", expect.objectContaining({ region: "jp", cookies: "" }));
    expect(mocks.ingest).toHaveBeenCalledWith(expect.objectContaining({ game: "chunithm", region: "jp", uploadSongs: [chart], updateMode: "alter" }));
    expect(mocks.publish).toHaveBeenCalledWith("chunithm");
    expect(mocks.invalidate).toHaveBeenCalledWith("all-unique-songs:chunithm", { expire: 3600 });
    expect(() => resolveGameContext("chunithm", "jp")).toThrow("not enabled");
  });
  it.each([[null, 401], ["wrong", 403]] as const)("rejects unauthorized requests before collection", async (token, status) => {
    expect((await GET(request("update_all?game=chunithm&region=jp", token))).status).toBe(status);
    expect(mocks.collect).not.toHaveBeenCalled();
    expect(mocks.ingest).not.toHaveBeenCalled();
  });
  it.each([null, undefined, "unknown"])("rejects unresolved introduction version %s before persistence", async addedVersion => {
    const unknown = { ...chart, addedVersion };
    mocks.collect.mockResolvedValueOnce([unknown]);
    expect((await GET(request("update_all?game=chunithm&region=jp&image_upload=false"))).status).toBe(400);
    expect(mocks.ingest).not.toHaveBeenCalled();
  });
  it("rejects cross-game upload records before persistence", async () => {
    const req = new NextRequest("https://example.test/api/admin/upload?game=chunithm&region=jp&version=9", {
      method: "POST", headers: { authorization: "Bearer admin-secret", "content-type": "application/json" },
      body: JSON.stringify({ songs: [{ ...chart, game: "maimai" }] }),
    });
    expect((await upload(req)).status).toBe(400);
    expect(mocks.ingest).not.toHaveBeenCalled();
  });
  it("rejects an unsupported CHUNITHM region", async () => {
    expect((await GET(request("update_all?game=chunithm&region=cn"))).status).toBe(400);
    expect(mocks.collect).not.toHaveBeenCalled();
  });
  it("still requires maimai source authentication for JP", async () => {
    expect((await GET(request("update_all?game=maimai&region=jp"))).status).toBe(400);
    expect(mocks.collect).not.toHaveBeenCalled();
    const response = await collect(request("update?game=maimai&region=jp&token=player-token"));
    expect(response.status).toBe(200);
    expect(mocks.login).toHaveBeenCalledWith("jp", "player-token");
  });
  it("keeps maimai CN source token-free", async () => {
    expect((await collect(request("update?game=maimai&region=cn"))).status).toBe(200);
    expect(mocks.login).not.toHaveBeenCalled();
  });
  it("does not upload or publish if collection fails", async () => {
    mocks.collect.mockRejectedValueOnce(new Error("source unavailable"));
    expect((await GET(request("update_all?game=chunithm&region=jp&image_upload=false"))).status).toBe(500);
    expect(mocks.ingest).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
  });
});
