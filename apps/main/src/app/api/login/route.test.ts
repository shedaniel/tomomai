import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ start: vi.fn(), log: { warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/base-url", () => ({ resolveBaseUrl: () => "https://tomomai.test" }));
vi.mock("@/lib/logger", () => ({ flushLogger: vi.fn() }));
vi.mock("@/lib/request-logger", () => ({
  requestLogger: () => ({ log: mocks.log, requestId: "login-test" }),
  getLogger: () => mocks.log,
}));
vi.mock("@/lib/security/middleware", () => ({
  securityMiddleware: async () => new Response(null), validateContentType: () => null,
}));
vi.mock("@/server/services/games/score-ingestion", () => ({ startScoreFetch: mocks.start, getScoreFetchStatus: vi.fn() }));
vi.mock("@/lib/trpc", async () => {
  const { initTRPC } = await import("@trpc/server");
  const t = initTRPC.context<{ session: { user: { id: string } } }>().create();
  return { router: t.router, protectedProcedure: t.procedure };
});

import { SEGA_AIME_GATEWAY } from "@/lib/games/sites";
import { fetchRouter } from "@/server/routers/user/fetch";
import { FetchStartError } from "@/server/services/games/fetch-errors";
import { POST } from "./route";

const now = new Date("2026-09-27T12:00:00+09:00");
const caller = fetchRouter.createCaller({
  req: new NextRequest("https://tomomai.test/api/trpc"),
  session: {
    user: { id: "same-owner", createdAt: now, updatedAt: now, email: "owner@example.test", emailVerified: true, name: "Owner", banned: false },
    session: { id: "session", userId: "same-owner", token: "test", createdAt: now, updatedAt: now, expiresAt: now },
  },
});

function callback(user: string, otp: string, extra: Record<string, string> = {}) {
  return POST(new NextRequest("https://tomomai.test/api/login", {
    method: "POST", body: new URLSearchParams({ user, otp, token: "gateway-cookie", ...extra }),
    headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: SEGA_AIME_GATEWAY.origin },
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubEnv("MAIMAI_TOTP_SECRET", "test-otp-secret");
  mocks.start.mockResolvedValue({ sessionId: "fetch-session", status: "pending" });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

it("rejects pre-versioned authorization even with a valid OTP", async () => {
  const response = await callback("c2FtZS1vd25lcg.zTB2EfssA1i_lOxmLZKrZPpIWEmaiqDza9Dgq1k3iLM", "622184");
  expect(response.status).toBe(401);
  expect(mocks.start).not.toHaveBeenCalled();
});

it.each(["maimai", "chunithm"] as const)("issues game-bound %s authorization through the unchanged gateway fields", async game => {
  const result = await caller.getLoginOtp({ game });
  const otherGame = game === "maimai" ? "chunithm" : "maimai";
  expect(result.loginPageUrl).toBe(game === "maimai" ? "https://maimaidx-eng.com/maimai-mobile/" : "https://chunithm-net-eng.com/mobile/");
  const link = new URL(result.loginLink);
  expect(`${link.origin}${link.pathname}`).toBe(SEGA_AIME_GATEWAY.landingUrl);
  expect(result.scriptUrl).toBe("https://tomomai.test/api/login.js");
  expect(result.otp).toBe("622184");
  const fields = new URLSearchParams(link.hash.slice(1));
  expect([...fields.keys()]).toEqual(["otp", "user"]);
  const authorization = fields.get("user")!;
  expect((await callback(authorization, fields.get("otp")!, { game: otherGame })).status).toBe(200);
  expect(mocks.start).toHaveBeenCalledWith(expect.objectContaining({ game, userId: "same-owner", region: "intl", token: "cookie://gateway-cookie" }));

  const [version, payload, signature] = authorization.split(".");
  const changedPayload = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url").toString()), game: otherGame })).toString("base64url");
  mocks.start.mockClear();
  expect((await callback(`${version}.${changedPayload}.${signature}`, result.otp)).status).toBe(401);
  expect(mocks.start).not.toHaveBeenCalled();
});

it("answers a fetch refused during maintenance with 503 and when to retry", async () => {
  const { loginLink, otp } = await caller.getLoginOtp({ game: "maimai" });
  const authorization = new URLSearchParams(new URL(loginLink).hash.slice(1)).get("user")!;
  mocks.start.mockRejectedValueOnce(new FetchStartError("MAINTENANCE", "Cannot fetch data during maintenance window (01:00 - 02:00 JST)", 1800));

  const response = await callback(authorization, otp);
  expect(response.status).toBe(503);
  expect(response.headers.get("Retry-After")).toBe("1800");
  expect(response.headers.get("Access-Control-Allow-Origin")).toBe(SEGA_AIME_GATEWAY.origin);
  expect(await response.json()).toEqual({
    success: false,
    error: "MAINTENANCE: Cannot fetch data during maintenance window (01:00 - 02:00 JST)",
    code: "MAINTENANCE",
    requestId: "login-test",
  });
  expect(mocks.log.error).not.toHaveBeenCalled();
});
