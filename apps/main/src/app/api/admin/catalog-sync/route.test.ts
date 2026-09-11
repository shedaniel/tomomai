import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ sync: vi.fn(), flush: vi.fn(), log: { error: vi.fn() } }));
vi.mock("@/server/services/catalog-sync", () => ({ syncCatalog: mocks.sync }));
vi.mock("@/lib/logger", () => ({ flushLogger: mocks.flush }));
vi.mock("@/lib/request-logger", () => ({ requestLogger: () => ({ log: mocks.log, requestId: "sync-test" }) }));
import { POST } from "./route";
import { GET } from "../../cron/catalog-sync/route";

function request(token?: string, force = false) {
  return new NextRequest(`https://example.test/api/admin/catalog-sync?force=${force}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ADMIN_UPDATE_TOKEN", "admin");
  vi.stubEnv("CRON_SECRET", "cron");
  mocks.sync.mockResolvedValue({ skipped: true, sequence: 2 });
});
afterEach(() => vi.unstubAllEnvs());

describe("catalog sync routes", () => {
  it("rejects missing and incorrect admin credentials", async () => {
    expect((await POST(request())).status).toBe(401);
    expect((await POST(request("bad"))).status).toBe(403);
    expect(mocks.sync).not.toHaveBeenCalled();
    expect(mocks.flush).toHaveBeenCalledTimes(2);
  });
  it("passes force only after authenticating", async () => {
    expect((await POST(request("admin", true))).status).toBe(200);
    expect(mocks.sync).toHaveBeenCalledWith({ force: true });
  });
  it("fails closed when credentials are unconfigured", async () => {
    vi.stubEnv("ADMIN_UPDATE_TOKEN", "");
    vi.stubEnv("CRON_SECRET", "");
    expect((await POST(request("admin"))).status).toBe(500);
    expect((await GET(request("cron"))).status).toBe(401);
    expect(mocks.sync).not.toHaveBeenCalled();
  });
  it("uses the dedicated cron secret", async () => {
    expect((await GET(request("admin"))).status).toBe(401);
    expect((await GET(request("cron"))).status).toBe(200);
    expect(mocks.sync).toHaveBeenCalledExactlyOnceWith();
  });
  it("awaits and reports sync failures with correlated logs", async () => {
    const err = new Error("checksum mismatch");
    mocks.sync.mockRejectedValue(err);
    const response = await POST(request("admin"));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Catalog sync failed", requestId: "sync-test" });
    expect(mocks.log.error).toHaveBeenCalledWith({ err }, "Catalog sync failed");
    expect(mocks.flush).toHaveBeenCalledOnce();
  });
});
