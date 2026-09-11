import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  publish: vi.fn(),
  flush: vi.fn(),
  invalidate: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/server/services/admin/song-catalog", () => ({ publishSongCatalog: mocks.publish }));
vi.mock("@/lib/logger", () => ({ flushLogger: mocks.flush }));
vi.mock("@/lib/request-logger", () => ({ requestLogger: () => ({ log: mocks.log, requestId: "publish-test" }) }));
vi.mock("next/cache", () => ({ revalidateTag: mocks.invalidate }));

import { POST } from "./route";

function request(token?: string) {
  return new NextRequest("https://example.test/api/admin/catalog/publish", {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ADMIN_UPDATE_TOKEN", "admin-secret");
  mocks.publish.mockResolvedValue({ songCount: 12, bytes: 345 });
  mocks.flush.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/admin/catalog/publish", () => {
  it.each([[undefined, 401], ["wrong-token", 403]] as const)("rejects unauthorized token %s without publishing", async (token, status) => {
    const response = await POST(request(token));
    expect(response.status).toBe(status);
    expect(mocks.publish).not.toHaveBeenCalled();
    expect(mocks.invalidate).not.toHaveBeenCalled();
    expect(mocks.flush).toHaveBeenCalledOnce();
  });

  it("fails closed if the admin token is not configured", async () => {
    vi.stubEnv("ADMIN_UPDATE_TOKEN", "");
    expect((await POST(request("admin-secret"))).status).toBe(500);
    expect(mocks.publish).not.toHaveBeenCalled();
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });

  it("awaits publication before invalidating caches", async () => {
    let complete!: (value: { songCount: number; bytes: number }) => void;
    mocks.publish.mockReturnValueOnce(new Promise(resolve => { complete = resolve; }));
    const pending = POST(request("admin-secret"));
    expect(mocks.publish).toHaveBeenCalledOnce();
    expect(mocks.invalidate).not.toHaveBeenCalled();
    complete({ songCount: 12, bytes: 345 });
    const response = await pending;
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, requestId: "publish-test", songCount: 12, bytes: 345 });
    expect(mocks.invalidate.mock.calls).toEqual([
      ["all-unique-songs", { expire: 0 }],
      ["reserved-songs", { expire: 0 }],
      ["api-v1-songs", { expire: 0 }],
    ]);
    expect(mocks.flush).toHaveBeenCalledOnce();
  });

  it("leaves caches intact after failed publication and permits a retry", async () => {
    const err = new Error("R2 write failed");
    mocks.publish.mockRejectedValueOnce(err);
    const failed = await POST(request("admin-secret"));
    expect(failed.status).toBe(500);
    expect(mocks.invalidate).not.toHaveBeenCalled();
    expect(mocks.log.error).toHaveBeenCalledWith({ err }, "Failed to publish public song catalog");
    const retried = await POST(request("admin-secret"));
    expect(retried.status).toBe(200);
    expect(mocks.publish).toHaveBeenCalledTimes(2);
    expect(mocks.invalidate).toHaveBeenCalledTimes(3);
    expect(mocks.flush).toHaveBeenCalledTimes(2);
  });
});
