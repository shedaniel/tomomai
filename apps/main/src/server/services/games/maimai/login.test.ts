import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ legacyTls: vi.fn(), fetch: vi.fn(), update: vi.fn(), remove: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/http-agent", () => ({ agentFetch: mocks.legacyTls }));
vi.mock("@/lib/request-logger", () => ({ getLogger: () => ({
  info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), child() { return this; },
}) }));
vi.mock("../tokens", () => ({ updateToken: mocks.update, deleteToken: mocks.remove, saveToken: mocks.save }));

import type { LxnsToken } from "@/lib/games/token-format";
import { openSegaSession } from "../sega/login";
import { lxnsAccessToken } from "./login";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.legacyTls.mockRejectedValue(new Error("Unexpected unverified TLS request"));
  mocks.fetch.mockRejectedValue(new Error("Unexpected request"));
});
afterEach(() => vi.unstubAllGlobals());

describe("maimai SEGA login", () => {
  it("signs International players in through the maimai gateway site and follows the game callback", async () => {
    mocks.fetch
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: "https://maimaidx-eng.com/maimai-mobile/?sid=callback" } }))
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: "/maimai-mobile/home/", "Set-Cookie": "userId=player; Path=/maimai-mobile/" } }))
      .mockResolvedValueOnce(new Response("Home", { headers: { "Set-Cookie": "_t=home; Path=/maimai-mobile/" } }));
    expect(await openSegaSession("maimai", "intl", "player", { provider: "sega-cookie", clal: "existing" })).toEqual({ cookies: "userId=player; _t=home" });
    const [loginUrl] = mocks.fetch.mock.calls[0];
    expect(Object.fromEntries(new URL(loginUrl).searchParams)).toEqual({
      site_id: "maimaidxex", redirect_url: "https://maimaidx-eng.com/maimai-mobile/", back_url: "https://maimai.sega.com/",
    });
    expect(String(mocks.fetch.mock.calls[1][0])).toBe("https://maimaidx-eng.com/maimai-mobile/?sid=callback");
    expect(mocks.legacyTls).not.toHaveBeenCalled();
  });
});

describe("maimai lxns access", () => {
  const token = (expiresAtMs: number): LxnsToken => ({ provider: "lxns", accessToken: "stale", refreshToken: "refresh", expiresAtMs, scope: "read" });

  afterEach(() => vi.unstubAllEnvs());

  it("reuses an unexpired access token without a request", async () => {
    expect(await lxnsAccessToken("player", "cn", token(Date.now() + 60_000))).toBe("stale");
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("refreshes an expired token and saves the new one", async () => {
    vi.stubEnv("LXNS_CLIENT_ID", "client");
    vi.stubEnv("LXNS_CLIENT_SECRET", "secret");
    mocks.fetch.mockResolvedValueOnce(Response.json({ data: { access_token: "fresh", expires_in: 900, scope: "read" } }));
    expect(await lxnsAccessToken("player", "cn", token(0))).toBe("fresh");
    expect(Object.fromEntries(new URLSearchParams(mocks.fetch.mock.calls[0][1].body))).toEqual({
      grant_type: "refresh_token", refresh_token: "refresh", client_id: "client", client_secret: "secret",
    });
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith("maimai", "player", "cn", expect.stringMatching(/^lxns:\/\/fresh::\/\/refresh::\/\/\d+::\/\/read$/));
  });

  it("deletes a token lxns will not refresh", async () => {
    vi.stubEnv("LXNS_CLIENT_ID", "client");
    vi.stubEnv("LXNS_CLIENT_SECRET", "secret");
    mocks.fetch.mockResolvedValueOnce(new Response("revoked", { status: 401 }));
    await expect(lxnsAccessToken("player", "cn", token(0))).rejects.toThrow("lxns refresh failed (401)");
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith("maimai", "player", "cn");
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
