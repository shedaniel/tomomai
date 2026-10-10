import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { rows, verifyAccessToken } = vi.hoisted(() => ({
  rows: [] as unknown[][],
  verifyAccessToken: vi.fn(),
}));

vi.mock("better-auth/oauth2", () => ({ verifyAccessToken }));
vi.mock("@/lib/auth", () => ({ auth: { api: { verifyApiKey: vi.fn() } } }));
vi.mock("@/lib/db", () => {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "from", "innerJoin", "leftJoin", "where"]) chain[m] = () => chain;
  chain.limit = async () => rows.shift() ?? [];
  return { db: chain };
});
vi.mock("@/lib/request-logger", () => ({ requestLogger: () => ({ log: { error: vi.fn() } }) }));
vi.mock("@/lib/api/registry", () => ({ findRouteByRequest: () => ({ cost: 1 }) }));
vi.mock("@/lib/security/redis-rate-limit", () => {
  const limiter = { check: async () => ({ limited: false, limit: 10, remaining: 9, retryAfter: 0 }), reward: async () => {} };
  return { apiKeyLimiter: limiter, apiUserLimiter: limiter };
});
vi.mock("@/lib/api/quota", () => ({
  consumeMonthly: async () => ({ ok: true, limit: 100, used: 1, resetAt: new Date() }),
  peekMonthly: async () => ({ limit: 100, used: 1, resetAt: new Date() }),
  refundMonthly: async () => {},
}));

import { withApiKey } from "./protect";

const handler = withApiKey(["user:metadata:read"], async (_req, key) => Response.json({ userId: key.userId }));

const readyHandler = withApiKey(["ready"], async (_req, key) => Response.json({ userId: key.userId }));

function call(token: string, route = handler) {
  const req = new NextRequest("https://example.test/api/v1/me", { headers: { authorization: `Bearer ${token}` } });
  return route(req, { params: Promise.resolve({}) });
}

const jwt = "header.payload.signature";
const future = new Date(Date.now() + 60_000);

beforeEach(() => {
  rows.length = 0;
  verifyAccessToken.mockReset();
  verifyAccessToken.mockResolvedValue({ sub: "user-1", azp: "client-1", scope: "user:metadata:read" });
});

describe("OAuth access tokens", () => {
  it.each([
    ["consent is present", [{ disabled: false, skipConsent: false, consentId: "c1" }], 200],
    ["consent was revoked", [{ disabled: false, skipConsent: false, consentId: null }], 403],
    ["client is disabled", [{ disabled: true, skipConsent: false, consentId: "c1" }], 403],
    ["client was deleted", [], 403],
  ])("JWT is served only while the grant is active: %s", async (_name, grant, status) => {
    rows.push(grant);
    expect((await call(jwt)).status).toBe(status);
  });

  it.each([
    [false, 200],
    [true, 403],
  ])("opaque token with clientDisabled=%s returns %i", async (clientDisabled, status) => {
    rows.push([{ id: "t1", userId: "user-1", scopes: ["user:metadata:read"], expiresAt: future, clientDisabled }]);
    expect((await call("opaque-token")).status).toBe(status);
  });

  it("never lets an OAuth token use an internal scope, even one stored on the client", async () => {
    const submitHandler = withApiKey(["snapshot:submit"], async () => Response.json({}));
    rows.push([{ id: "t1", userId: "user-1", scopes: ["snapshot:submit"], expiresAt: future, clientDisabled: false }]);
    expect((await call("opaque-token", submitHandler)).status).toBe(403);
  });

  it("grants the ready scope to tokens whose app did not request it", async () => {
    rows.push([{ id: "t1", userId: "user-1", scopes: ["user:metadata:read"], expiresAt: future, clientDisabled: false }]);
    expect((await call("opaque-token", readyHandler)).status).toBe(200);
  });
});
