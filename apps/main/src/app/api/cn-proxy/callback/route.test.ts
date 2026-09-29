import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  deleteToken: vi.fn(),
  agentFetch: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/http-agent", () => ({ agentFetch: mocks.agentFetch }));
vi.mock("@/lib/request-logger", () => ({ requestLogger: () => ({ log: mocks.log, requestId: "cn-proxy-test" }), getLogger: () => mocks.log }));
vi.mock("@/server/services/games/tokens", () => ({ deleteToken: mocks.deleteToken, saveToken: vi.fn() }));
vi.mock("@/server/services/games/score-ingestion", () => ({ startScoreFetch: mocks.start }));

import { signCnProxyToken } from "@/server/services/games/maimai/cn-proxy-token";
import { FetchStartError } from "@/server/services/games/fetch-errors";
import { POST } from "./route";

function callback() {
  return POST(new NextRequest("https://tomomai.test/api/cn-proxy/callback", {
    method: "POST",
    body: JSON.stringify({ token: signCnProxyToken("owner"), maimaiToken: "single-use", r: "proxy" }),
  }));
}

function serveWahlap(playerHtml: string) {
  mocks.agentFetch.mockImplementation(async (url: string) => url.includes("/playerData/")
    ? new Response(playerHtml)
    : new Response(null, { status: 302, headers: { "Set-Cookie": "_t=session; Path=/" } }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CN_PROXY_TOKEN_SECRET", "test-secret");
  vi.stubEnv("DEBUG_CN_FETCH", undefined);
  mocks.start.mockResolvedValue({ sessionId: "fetch-session", status: "pending" });
  mocks.deleteToken.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());

it("starts the fetch with the verified cookies as a newly supplied token", async () => {
  serveWahlap('<div class="name_block">Player</div>');
  const response = await callback();
  expect(await response.json()).toEqual({ ok: true, sessionId: "fetch-session" });
  expect(mocks.start).toHaveBeenCalledWith({ userId: "owner", game: "maimai", region: "cn", token: "cn-cookies://_t=session" });
  expect(mocks.deleteToken).not.toHaveBeenCalled();
});

it("answers a refused fetch with its status and code", async () => {
  serveWahlap('<div class="name_block">Player</div>');
  mocks.start.mockRejectedValueOnce(new FetchStartError("FETCH_IN_PROGRESS", "A fetch is already in progress for this region"));
  const response = await callback();
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({
    ok: false, error: "FETCH_IN_PROGRESS: A fetch is already in progress for this region", code: "FETCH_IN_PROGRESS",
  });
  expect(mocks.log.error).not.toHaveBeenCalled();
});

it("deletes the stored CN token and starts nothing when the cookies fail verification", async () => {
  serveWahlap("<p>登录失败</p>");
  const response = await callback();
  expect(response.status).toBe(502);
  expect(mocks.deleteToken).toHaveBeenCalledWith("maimai", "owner", "cn");
  expect(mocks.start).not.toHaveBeenCalled();
});
