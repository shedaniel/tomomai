import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => {
  const log = { child: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  log.child.mockReturnValue(log);
  return { log, update: vi.fn() };
});
vi.mock("@/server/services/catalog/apply", () => ({ updateCatalogRegion: mocks.update }));
vi.mock("@/lib/logger", () => ({ flushLogger: vi.fn() }));
vi.mock("@/lib/request-logger", () => ({
  requestLogger: () => ({ log: mocks.log, requestId: "update-all-test" }),
  runWithLogger: (_log: unknown, run: () => unknown) => run(),
}));

import { GET } from "./route";

const get = (query: string, token: string | null = "admin-secret") => GET(new NextRequest(
  `https://example.test/api/admin/update_all?${query}`,
  { headers: token ? { authorization: `Bearer ${token}` } : {} },
));
const outcome = (region: string) => ({ updateMode: "alter", region });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.log.child.mockReturnValue(mocks.log);
  vi.stubEnv("ADMIN_UPDATE_TOKEN", "admin-secret");
  vi.stubEnv("FRONTEND_GAME", "chunithm");
  vi.stubEnv("NEXT_PUBLIC_ENABLED_CHUNITHM_REGIONS", "intl,jp");
  mocks.update.mockImplementation(async ({ region }: { region: string }) => outcome(region));
});
afterEach(() => vi.unstubAllEnvs());

describe("GET /api/admin/update_all", () => {
  it("updates each enabled region in order in this process", async () => {
    const response = await get("game=chunithm");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true, requestId: "update-all-test", message: "INTL and JP updated successfully",
      intl: outcome("intl"), jp: outcome("jp"),
    });
    expect(mocks.update.mock.calls.map(([args]) => args)).toEqual(["intl", "jp"].map(region => ({
      game: "chunithm", region, sourceToken: null, hostImages: true, log: mocks.log, requestId: "update-all-test",
    })));
  });

  it("updates one explicit region and can skip image hosting", async () => {
    expect((await get("game=chunithm&region=jp&image_upload=false")).status).toBe(200);
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ region: "jp", hostImages: false }));
  });

  it("refuses a CHUNITHM write on the maimai site before collecting", async () => {
    vi.stubEnv("FRONTEND_GAME", "maimai");
    const response = await get("game=chunithm&region=jp");
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "WRONG_SITE", requestId: "update-all-test" });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it.each([[null, 401], ["wrong", 403]] as const)("rejects an unauthorized request before collecting", async (token, status) => {
    expect((await get("game=chunithm", token)).status).toBe(status);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("rejects a region the game does not support", async () => {
    expect((await get("game=chunithm&region=cn")).status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("requires the maimai source token for JP before collecting", async () => {
    vi.stubEnv("FRONTEND_GAME", "maimai");
    const response = await get("game=maimai&region=jp");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Missing 'token' query parameter (required by catalog source)", requestId: "update-all-test" });
    expect(mocks.update).not.toHaveBeenCalled();
    expect((await get("game=maimai&region=cn")).status).toBe(200);
  });

  it("stops at the first region that fails", async () => {
    mocks.update.mockRejectedValueOnce(new Error("source unavailable"));
    const response = await get("game=chunithm");
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "source unavailable", requestId: "update-all-test" });
    expect(mocks.update).toHaveBeenCalledOnce();
  });
});
