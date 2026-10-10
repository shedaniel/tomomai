import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); } }));
vi.mock("next/font/local", () => ({ default: () => ({ variable: "font" }) }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/auth-server", () => ({ getServerSession: vi.fn() }));

type Handler = (request: NextRequest) => unknown;

// Every handler here serves a maimai-only feature: renders, the China proxy, lxns sign-in, the userscript and
// the percentile refresh cron, which every deployment registers.
const ROUTES: Record<string, () => Promise<Handler>> = {
  "GET /api/cron/percentile-bands": async () => (await import("./api/cron/percentile-bands/route")).GET,
  "GET /api/daily-plays": async () => (await import("./api/daily-plays/route")).GET,
  "GET /api/export-image": async () => (await import("./api/export-image/route")).GET,
  "GET /api/last-credit": async () => (await import("./api/last-credit/route")).GET,
  "POST /api/cn-proxy/callback": async () => (await import("./api/cn-proxy/callback/route")).POST,
  "GET /api/cn-proxy/yaml": async () => (await import("./api/cn-proxy/yaml/route")).GET,
  "GET /cn-proxy/link": async () => (await import("./cn-proxy/link/route")).GET,
  "GET /api/oauth/lxns/start": async () => (await import("./api/oauth/lxns/start/route")).GET,
  "GET /api/oauth/lxns/callback": async () => (await import("./api/oauth/lxns/callback/route")).GET,
  "GET /userscript.user.js": async () => (await import("./userscript.user.js/route")).GET,
  "GET /userscript/callback": async () => (await import("./userscript/callback/route")).GET,
  "OPTIONS /api/userscript/token": async () => (await import("./api/userscript/token/route")).OPTIONS,
  "POST /api/userscript/token": async () => (await import("./api/userscript/token/route")).POST,
  "/{locale}/cn-proxy pages": async () => {
    const { default: CnProxyLayout } = await import("./[locale]/cn-proxy/layout");
    return () => CnProxyLayout({ children: null });
  },
};

describe("maimai-only routes on the CHUNITHM site", () => {
  beforeAll(() => { vi.stubEnv("FRONTEND_GAME", "chunithm"); });
  afterAll(() => { vi.unstubAllEnvs(); });

  it.each(Object.keys(ROUTES))("%s answers 404", async route => {
    const handler = await ROUTES[route]();
    await expect(async () => handler(new NextRequest("https://tomochu.test/"))).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("maimai-only routes on the maimai site", () => {
  beforeAll(() => { vi.stubEnv("FRONTEND_GAME", "maimai"); });
  afterAll(() => { vi.unstubAllEnvs(); });

  it("serves the China proxy pages", async () => {
    const handler = await ROUTES["/{locale}/cn-proxy pages"]();
    expect(() => handler(new NextRequest("https://tomomai.test/"))).not.toThrow();
  });
});
