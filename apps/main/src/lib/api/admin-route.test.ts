import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { DrizzleQueryError } from "drizzle-orm";
import { GameAdapterError } from "@/lib/games/errors";

const mocks = vi.hoisted(() => {
  const log = { child: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  log.child.mockReturnValue(log);
  return { log, flush: vi.fn(), ambient: vi.fn() };
});
vi.mock("@/lib/logger", () => ({ flushLogger: mocks.flush }));
vi.mock("@/lib/request-logger", () => ({
  requestLogger: () => ({ log: mocks.log, requestId: "admin-test" }),
  runWithLogger: (log: unknown, run: () => unknown) => { mocks.ambient(log); return run(); },
}));

import { adminRoute } from "./admin-route";
import { AdminRequestError } from "@/server/services/catalog/admin-game";

function request(path: string, token: string | null = "admin-secret") {
  return new NextRequest(`https://example.test/api/admin/${path}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.log.child.mockReturnValue(mocks.log);
  vi.stubEnv("ADMIN_UPDATE_TOKEN", "admin-secret");
  vi.stubEnv("FRONTEND_GAME", "maimai");
});
afterEach(() => vi.unstubAllEnvs());

describe("adminRoute", () => {
  const handler = vi.fn(async () => Response.json({ success: true }));

  it.each([
    ["a missing token", null, 401, "Missing authorization token"],
    ["a wrong token", "wrong-secret", 403, "Invalid authorization token"],
    ["a token of another length", "admin", 403, "Invalid authorization token"],
  ])("answers %s before the handler runs", async (_name, token, status, error) => {
    const response = await adminRoute("admin/test", handler)(request("test", token));
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error, requestId: "admin-test" });
    expect(handler).not.toHaveBeenCalled();
    expect(mocks.flush).toHaveBeenCalledOnce();
  });

  it("fails closed when the admin token is not configured", async () => {
    vi.stubEnv("ADMIN_UPDATE_TOKEN", "");
    const response = await adminRoute("admin/test", handler)(request("test"));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Server configuration error", requestId: "admin-test" });
    expect(mocks.log.error).toHaveBeenCalledWith("ADMIN_UPDATE_TOKEN environment variable not set");
    expect(handler).not.toHaveBeenCalled();
  });

  it("serves a link route without a token and hands it the path params", async () => {
    const route = adminRoute<{ id: string }>("admin/test", async ({ params }) => Response.json(params), { auth: "none" });
    const response = await route(request("test/abc", null), { params: Promise.resolve({ id: "abc" }) });
    expect(await response.json()).toEqual({ id: "abc" });
  });

  it("resolves the game, binds it to the logger and serves any game for reads", async () => {
    const route = adminRoute("admin/test", async ({ game }) => Response.json({ game }), { game: "read" });
    const response = await route(request("test?game=chunithm"));
    expect(await response.json()).toEqual({ game: "chunithm" });
    expect(mocks.log.child).toHaveBeenCalledWith({ game: "chunithm" });
    expect(mocks.ambient).toHaveBeenCalledWith(mocks.log);
  });

  it("answers a missing game with UNKNOWN_GAME and the request id", async () => {
    const response = await adminRoute("admin/test", handler, { game: "read" })(request("test"));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "UNKNOWN_GAME", requestId: "admin-test" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("refuses a write for a game this site does not serve", async () => {
    const route = adminRoute("admin/test", handler, { game: "write" });
    const response = await route(request("test?game=chunithm"));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "WRONG_SITE", requestId: "admin-test" });
    expect(handler).not.toHaveBeenCalled();

    vi.stubEnv("FRONTEND_GAME", "chunithm");
    expect((await route(request("test?game=chunithm"))).status).toBe(200);
  });

  it("maps a game rejection thrown by the handler", async () => {
    const error = new GameAdapterError("UNSUPPORTED_REGION", "No such region");
    const response = await adminRoute("admin/test", async () => { throw error; })(request("test"));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "No such region", code: "UNSUPPORTED_REGION", requestId: "admin-test" });
    expect(mocks.log.warn).toHaveBeenCalledWith({ err: error }, "Admin request rejected");
  });

  it("answers a malformed request with 400", async () => {
    const response = await adminRoute("admin/test", async () => { throw new AdminRequestError("Missing 'version' query parameter"); })(request("test"));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Missing 'version' query parameter", requestId: "admin-test" });
  });

  it("logs a failure, reports the database cause without its SQL and flushes", async () => {
    const error = new DrizzleQueryError("insert into songs secret-sql", ["secret-parameter"], Object.assign(new Error("duplicate key"), { code: "23505" }));
    const response = await adminRoute("admin/test", async () => { throw error; })(request("test"));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ error: "[23505] duplicate key", requestId: "admin-test" });
    expect(mocks.log.error).toHaveBeenCalledWith({ err: error }, "Admin request failed");
    expect(mocks.flush).toHaveBeenCalledOnce();
  });
});
