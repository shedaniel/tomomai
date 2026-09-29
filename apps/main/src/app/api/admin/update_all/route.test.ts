import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { CatalogCollectContext } from "@/server/services/catalog/ingestion/types";
import type { CanonicalGameId } from "@/lib/games/types";
import { DrizzleQueryError } from "drizzle-orm";
import { catalogTags } from "@/lib/cache-tags";

const mocks = vi.hoisted(() => {
  const log = { child: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  log.child.mockReturnValue(log);
  return { log, source: vi.fn(), ingest: vi.fn(), publish: vi.fn(), login: vi.fn(), notice: vi.fn().mockResolvedValue(undefined), flush: vi.fn(), invalidate: vi.fn() };
});
vi.mock("@/server/services/catalog/ingestion/collect", async importOriginal => ({
  ...await importOriginal<typeof import("@/server/services/catalog/ingestion/collect")>(),
  collectCatalog: (game: CanonicalGameId, ctx: CatalogCollectContext) => mocks.source(game, ctx),
}));
vi.mock("@/server/services/games/maimai/login", () => ({ loginAndGetCookies: mocks.login }));
vi.mock("@/lib/games/versions", () => ({ getCurrentVersion: () => 9, getRegionalVersion: () => ({ id: 9 }) }));
vi.mock("@/server/services/catalog/ingestion/persistence", () => ({ persistCatalog: mocks.ingest }));
vi.mock("@/server/services/catalog/publication", () => ({ publishSongCatalog: mocks.publish }));
vi.mock("@/server/services/catalog/notifications", () => ({ sendDiscordWebhook: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/server/services/discord/webhook", () => ({ sendDiscordNotice: mocks.notice }));
vi.mock("@/lib/logger", () => ({ flushLogger: mocks.flush }));
vi.mock("@/lib/request-logger", () => ({
  requestLogger: () => ({ log: mocks.log, requestId: "catalog-test" }),
  runWithLogger: (_log: unknown, run: () => unknown) => run(),
}));
vi.mock("@/lib/song-slug", () => ({ getSongSlugs: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/utils", () => ({ sortKeys: (value: unknown) => value, awaitWrapper: async (promise: Promise<unknown>) => { try { return [await promise, null]; } catch (error) { return [null, error]; } } }));
vi.mock("next/cache", () => ({ revalidateTag: mocks.invalidate, revalidatePath: mocks.invalidate }));

import { GET } from "./route";
import { GET as collect } from "../update/route";
import { POST as upload } from "../upload/route";

const chart = { game: "chunithm", songName: "Example", artist: "Artist", chartType: 0, difficulty: 4, level: "14+", levelPrecise: 145, addedVersion: 9, cover: "https://example.test/cover.jpg", genre: "Original" };
function request(path: string, token: string | null = "admin-secret") {
  return new NextRequest(`https://example.test/api/admin/${path}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ADMIN_UPDATE_TOKEN", "admin-secret");
  vi.stubEnv("FRONTEND_GAME", "chunithm");
  mocks.source.mockImplementation(async (game: CanonicalGameId) => [{ ...chart, game }]);
  mocks.ingest.mockResolvedValue({
    statistics: { inputSongs: 1, dbSongs: 0, mergedSongs: 1, added: 1, modified: 0, deleted: 0, unchanged: 0 },
    changes: { added: [], modified: [], deleted: [], unchanged: [] },
    applied: { added: 1, modified: 0, deleted: 0, newParents: 1, parentUpdates: 0 },
    appliedDeletions: [], skippedDeletions: [], affected: [chart],
  });
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
    const response = await GET(request("update_all?game=chunithm&region=jp&image_upload=false"));
    expect(response.status).toBe(200);
    expect(mocks.login).not.toHaveBeenCalled();
    expect(mocks.source).toHaveBeenCalledWith("chunithm", expect.objectContaining({ region: "jp", session: { cookies: "" } }));
    expect(mocks.ingest).toHaveBeenCalledWith("chunithm", "jp", 9, [chart], "alter", mocks.log);
    expect(mocks.publish).toHaveBeenCalledWith("chunithm");
    expect(mocks.invalidate).toHaveBeenCalledWith(catalogTags("chunithm").uniqueSongs, { expire: 0 });
  });
  it.each([[null, 401], ["wrong", 403]] as const)("rejects unauthorized requests before collection", async (token, status) => {
    expect((await GET(request("update_all?game=chunithm&region=jp", token))).status).toBe(status);
    expect(mocks.source).not.toHaveBeenCalled();
    expect(mocks.ingest).not.toHaveBeenCalled();
  });
  it("rejects invalid upload JSON before persistence or publication", async () => {
    const req = new NextRequest("https://example.test/api/admin/upload?game=chunithm&region=jp&version=9", {
      method: "POST", headers: { authorization: "Bearer admin-secret", "content-type": "application/json" },
      body: JSON.stringify({ songs: [{ ...chart, addedVersion: null }] }),
    });
    expect((await upload(req)).status).toBe(400);
    expect(mocks.ingest).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
  });
  it.each([
    { name: "driver parameter limit", cause: Object.assign(new Error("Max number of parameters exceeded"), { code: "MAX_PARAMETERS_EXCEEDED" }), expected: ["Max number of parameters exceeded", "MAX_PARAMETERS_EXCEEDED"] },
    { name: "Postgres constraint", cause: Object.assign(new Error("duplicate key value violates unique constraint"), { code: "23505", constraint_name: "parent_song_publicId_unique", detail: "Key value: secret-detail" }), expected: ["duplicate key value violates unique constraint", "23505", "parent_song_publicId_unique"] },
    { name: "absent database cause", cause: undefined, expected: ["Database query failed"] },
  ])("reports the $name without burying it in SQL or parameters", async ({ cause, expected }) => {
    const error = new DrizzleQueryError(`insert into parent_song ${"secret-sql ".repeat(1000)}`, ["secret-parameter"], cause);
    mocks.ingest.mockRejectedValueOnce(error);
    const req = new NextRequest("https://example.test/api/admin/upload?game=chunithm&region=jp&version=9&update=alter", {
      method: "POST", headers: { authorization: "Bearer admin-secret", "content-type": "application/json" },
      body: JSON.stringify({ songs: [chart] }),
    });
    const response = await upload(req);
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.requestId).toBe("catalog-test");
    const description = mocks.notice.mock.calls[0][3];
    for (const message of [body.error, description]) {
      for (const text of expected) expect(message.includes(text), text).toBe(true);
      expect(message).not.toContain("secret-");
      expect(message.length).toBeLessThan(4096);
    }
    expect(description).toContain("catalog-test");
    expect(mocks.log.error).toHaveBeenCalledWith({ err: error }, "Error in admin upload route");
  });
  it("preserves ordinary upload error messages", async () => {
    mocks.ingest.mockRejectedValueOnce(new Error("Ambiguous catalog identity: Example"));
    const response = await upload(new NextRequest("https://example.test/api/admin/upload?game=chunithm&region=jp&version=9&update=alter", {
      method: "POST", headers: { authorization: "Bearer admin-secret", "content-type": "application/json" },
      body: JSON.stringify({ songs: [chart] }),
    }));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Ambiguous catalog identity: Example", requestId: "catalog-test" });
  });
  it("rejects an unsupported CHUNITHM region", async () => {
    expect((await GET(request("update_all?game=chunithm&region=cn"))).status).toBe(400);
    expect(mocks.source).not.toHaveBeenCalled();
  });
  it("still requires maimai source authentication for JP", async () => {
    vi.stubEnv("FRONTEND_GAME", "maimai");
    expect((await GET(request("update_all?game=maimai&region=jp"))).status).toBe(400);
    expect(mocks.source).not.toHaveBeenCalled();
    const response = await collect(request("update?game=maimai&region=jp&token=player-token"));
    expect(response.status).toBe(200);
    expect(mocks.login).toHaveBeenCalledWith("jp", "player-token");
    expect(mocks.source).toHaveBeenCalledWith("maimai", expect.objectContaining({ session: { cookies: "source-cookie" } }));
  });
  it("keeps maimai CN source token-free", async () => {
    expect((await collect(request("update?game=maimai&region=cn"))).status).toBe(200);
    expect(mocks.login).not.toHaveBeenCalled();
  });
  it("does not upload or publish when collection fails", async () => {
    const game = "chunithm";
    mocks.source.mockRejectedValueOnce(new Error("source unavailable"));
    expect((await GET(request(`update_all?game=${game}&region=jp&image_upload=false&token=player-token`))).status).toBe(500);
    expect(mocks.ingest).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
  });
});
