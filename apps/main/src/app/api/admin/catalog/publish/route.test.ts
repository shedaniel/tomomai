import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => {
  const log = { child: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  log.child.mockReturnValue(log);
  return { log, publish: vi.fn(), revalidate: vi.fn(), flush: vi.fn() };
});
vi.mock("@/server/services/catalog/publication", () => ({ publishSongCatalog: mocks.publish }));
vi.mock("@/server/services/catalog/revalidation", () => ({ revalidateCatalog: mocks.revalidate }));
vi.mock("@/lib/logger", () => ({ flushLogger: mocks.flush }));
vi.mock("@/lib/request-logger", () => ({
  requestLogger: () => ({ log: mocks.log, requestId: "publish-test" }),
  runWithLogger: (_log: unknown, run: () => unknown) => run(),
}));

import { POST } from "./route";

const request = () => new NextRequest("https://example.test/api/admin/catalog/publish?game=maimai", {
  method: "POST",
  headers: { authorization: "Bearer admin-secret" },
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.log.child.mockReturnValue(mocks.log);
  vi.stubEnv("ADMIN_UPDATE_TOKEN", "admin-secret");
  vi.stubEnv("FRONTEND_GAME", "maimai");
  mocks.publish.mockResolvedValue({ songCount: 12, bytes: 345 });
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/admin/catalog/publish?game=maimai", () => {
  it("awaits publication before invalidating the whole catalog", async () => {
    let complete!: (value: { songCount: number; bytes: number }) => void;
    mocks.publish.mockReturnValueOnce(new Promise(resolve => { complete = resolve; }));
    const pending = POST(request());
    await vi.waitFor(() => expect(mocks.publish).toHaveBeenCalledExactlyOnceWith("maimai"));
    expect(mocks.revalidate).not.toHaveBeenCalled();
    complete({ songCount: 12, bytes: 345 });
    const response = await pending;
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, game: "maimai", requestId: "publish-test", songCount: 12, bytes: 345 });
    expect(mocks.revalidate).toHaveBeenCalledExactlyOnceWith("maimai", { log: mocks.log });
  });

  it("leaves caches intact after failed publication and permits a retry", async () => {
    mocks.publish.mockRejectedValueOnce(new Error("R2 write failed"));
    const failed = await POST(request());
    expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual({ error: "R2 write failed", requestId: "publish-test" });
    expect(mocks.revalidate).not.toHaveBeenCalled();
    expect((await POST(request())).status).toBe(200);
    expect(mocks.publish).toHaveBeenCalledTimes(2);
    expect(mocks.revalidate).toHaveBeenCalledOnce();
  });
});
