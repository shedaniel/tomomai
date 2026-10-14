import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => {
  const log = { child: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  log.child.mockReturnValue(log);
  return { log, local: vi.fn(), fanOut: vi.fn() };
});
vi.mock("@/server/services/catalog/revalidation", async importOriginal => ({
  ...await importOriginal<typeof import("@/server/services/catalog/revalidation")>(),
  revalidateCatalogLocal: mocks.local,
  revalidateCatalog: mocks.fanOut,
}));
vi.mock("@/lib/logger", () => ({ flushLogger: vi.fn() }));
vi.mock("@/lib/request-logger", () => ({
  requestLogger: () => ({ log: mocks.log, requestId: "peer-test" }),
  runWithLogger: (_log: unknown, run: () => unknown) => run(),
}));

import { POST } from "./route";

const post = (body: string) => POST(new NextRequest("https://example.test/api/admin/catalog/revalidate?game=chunithm", {
  method: "POST",
  headers: { authorization: "Bearer admin-secret", "content-type": "application/json" },
  body,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.log.child.mockReturnValue(mocks.log);
  vi.stubEnv("ADMIN_UPDATE_TOKEN", "admin-secret");
  vi.stubEnv("FRONTEND_GAME", "maimai");
  mocks.local.mockResolvedValue({ pages: "none", count: 0 });
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/admin/catalog/revalidate", () => {
  it("revalidates another game's catalog here without posting to the peers again", async () => {
    const affected = [{ songName: "Song", artist: "Artist", chartType: 0 }];
    const response = await post(JSON.stringify({ affected }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, requestId: "peer-test", pages: "none", count: 0 });
    expect(mocks.local).toHaveBeenCalledExactlyOnceWith("chunithm", affected);
    expect(mocks.fanOut).not.toHaveBeenCalled();
  });

  it("treats a body without charts as a whole catalog change", async () => {
    expect((await post("{}")).status).toBe(200);
    expect(mocks.local).toHaveBeenCalledExactlyOnceWith("chunithm", undefined);
  });

  it.each(["not json", JSON.stringify({ affected: [{ songName: "Song" }] })])("rejects the malformed body %s", async body => {
    expect((await post(body)).status).toBe(400);
    expect(mocks.local).not.toHaveBeenCalled();
  });
});
