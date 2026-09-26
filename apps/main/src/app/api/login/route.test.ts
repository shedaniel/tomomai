import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ start: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/flags", () => ({ resolveFlagsForUser: async () => ({}) }));
vi.mock("@/lib/base-url", () => ({ resolveBaseUrl: () => "https://tomomai.test" }));
vi.mock("@/lib/logger", () => ({ flushLogger: vi.fn() }));
vi.mock("@/lib/request-logger", () => ({
  requestLogger: () => ({ log: { error: vi.fn() }, requestId: "login-test" }),
  getLogger: () => ({ error: vi.fn() }),
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

import { fetchRouter } from "@/server/routers/user/fetch";
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
    headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: "https://lng-tgk-aime-gw.am-all.net" },
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

it("accepts existing maimai gateway links without allowing an unsigned game override", async () => {
  const response = await callback("c2FtZS1vd25lcg.zTB2EfssA1i_lOxmLZKrZPpIWEmaiqDza9Dgq1k3iLM", "622184", { game: "chunithm" });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ success: true, sessionId: "fetch-session" });
  expect(mocks.start).toHaveBeenCalledWith(expect.objectContaining({ game: "maimai", userId: "same-owner", region: "intl", token: "cookie://gateway-cookie" }));
});

it("issues game-bound authorization through the unchanged gateway fields", async () => {
  const result = await caller.getLoginOtp({ game: "maimai" });
  const link = new URL(result.loginLink);
  expect(`${link.origin}${link.pathname}`).toBe("https://lng-tgk-aime-gw.am-all.net/common_auth/");
  expect(result.scriptUrl).toBe("https://tomomai.test/api/login.js");
  expect(result.otp).toBe("622184");
  const fields = new URLSearchParams(link.hash.slice(1));
  expect([...fields.keys()]).toEqual(["otp", "user"]);
  const authorization = fields.get("user")!;
  expect((await callback(authorization, fields.get("otp")!)).status).toBe(200);
  expect(mocks.start).toHaveBeenCalledWith(expect.objectContaining({ game: "maimai", userId: "same-owner" }));

  const [version, payload, signature] = authorization.split(".");
  const changedPayload = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url").toString()), game: "chunithm" })).toString("base64url");
  mocks.start.mockClear();
  expect((await callback(`${version}.${changedPayload}.${signature}`, result.otp)).status).toBe(401);
  expect(mocks.start).not.toHaveBeenCalled();
});

it("does not issue a working login link for an unimplemented game source", async () => {
  await expect(caller.getLoginOtp({ game: "chunithm" })).rejects.toMatchObject({ cause: { code: "SOURCE_NOT_CONFIGURED" } });
  expect(mocks.start).not.toHaveBeenCalled();
});
