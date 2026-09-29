import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ legacyTls: vi.fn(), fetch: vi.fn(), update: vi.fn(), remove: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/http-agent", () => ({ agentFetch: mocks.legacyTls }));
vi.mock("@/lib/request-logger", () => ({ getLogger: () => ({
  info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), child() { return this; },
}) }));
vi.mock("../tokens", () => ({ updateToken: mocks.update, deleteToken: mocks.remove, saveToken: mocks.save }));

import { getGameSite } from "@/lib/games/sites";
import { loginAndGetCookies, maimaiSegaLogin, openMaimaiLogin } from "./login";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.legacyTls.mockRejectedValue(new Error("Unexpected unverified TLS request"));
  mocks.fetch.mockRejectedValue(new Error("Unexpected request"));
});
afterEach(() => vi.unstubAllGlobals());

describe("maimai SEGA login", () => {
  it("signs in through the gateway exactly where the site has one", () => {
    for (const config of Object.values(maimaiSegaLogin)) {
      expect(config.kind === "aime-gateway").toBe(getGameSite("maimai", config.region)?.aime !== undefined);
    }
  });

  it("signs International players in through the maimai gateway site and follows the game callback", async () => {
    mocks.fetch
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: "https://maimaidx-eng.com/maimai-mobile/?sid=callback" } }))
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: "/maimai-mobile/home/", "Set-Cookie": "userId=player; Path=/maimai-mobile/" } }))
      .mockResolvedValueOnce(new Response("Home", { headers: { "Set-Cookie": "_t=home; Path=/maimai-mobile/" } }));
    expect(await openMaimaiLogin("player", "intl", "cookie://clal=existing")).toEqual({ kind: "site-session", cookies: "userId=player; _t=home" });
    const [loginUrl] = mocks.fetch.mock.calls[0];
    expect(Object.fromEntries(new URL(loginUrl).searchParams)).toEqual({
      site_id: "maimaidxex", redirect_url: "https://maimaidx-eng.com/maimai-mobile/", back_url: "https://maimai.sega.com/",
    });
    expect(String(mocks.fetch.mock.calls[1][0])).toBe("https://maimaidx-eng.com/maimai-mobile/?sid=callback");
    expect(mocks.legacyTls).not.toHaveBeenCalled();
  });

  it("signs JP players in on maimaidx.jp and selects the first card", async () => {
    const entry = new Headers();
    entry.append("Set-Cookie", "_t=form-token; Path=/maimai-mobile/");
    entry.append("Set-Cookie", "session=jp; Path=/maimai-mobile/");
    mocks.legacyTls
      .mockResolvedValueOnce(new Response("", { headers: entry }))
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: "https://maimaidx.jp/maimai-mobile/aimeList/" } }))
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: "/maimai-mobile/home/", "Set-Cookie": "userId=selected; Path=/maimai-mobile/" } }))
      .mockResolvedValueOnce(new Response("Home"));

    expect(await loginAndGetCookies("jp", "account://name:://password")).toBe("_t=form-token; session=jp; userId=selected");
    expect(mocks.legacyTls.mock.calls.map(([url]) => String(url))).toEqual([
      "https://maimaidx.jp/maimai-mobile/",
      "https://maimaidx.jp/maimai-mobile/submit/",
      "https://maimaidx.jp/maimai-mobile/aimeList/submit/?idx=0",
      "https://maimaidx.jp/maimai-mobile/home/",
    ]);
    expect(new URLSearchParams(mocks.legacyTls.mock.calls[1][1].body).get("token")).toBe("form-token");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("deletes a CN provider token stored for a SEGA region without asking SEGA", async () => {
    await expect(openMaimaiLogin("player", "intl", "lxns://access:://refresh:://0:://read")).rejects.toThrow("Invalid token format");
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith("maimai", "player", "intl");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});

describe("maimai CN login", () => {
  it("keeps a captured proxy session ready without a SEGA exchange", async () => {
    expect(await loginAndGetCookies("cn", "cn-cookies://userId=cn-player; session=cn")).toBe("userId=cn-player; session=cn");
    expect(mocks.legacyTls).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("reuses an unexpired Lxns access token without a request", async () => {
    const token = `lxns://access:://refresh:://${Date.now() + 60_000}:://read`;
    expect(await openMaimaiLogin("player", "cn", token)).toEqual({ kind: "lxns", accessToken: "access" });
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("refreshes an expired Lxns token and saves the new one", async () => {
    vi.stubEnv("LXNS_CLIENT_ID", "client");
    vi.stubEnv("LXNS_CLIENT_SECRET", "secret");
    mocks.fetch.mockResolvedValueOnce(Response.json({ data: { access_token: "fresh", expires_in: 900, scope: "read" } }));
    try {
      expect(await openMaimaiLogin("player", "cn", "lxns://stale:://refresh:://0:://read")).toEqual({ kind: "lxns", accessToken: "fresh" });
    } finally {
      vi.unstubAllEnvs();
    }
    expect(Object.fromEntries(new URLSearchParams(mocks.fetch.mock.calls[0][1].body))).toEqual({
      grant_type: "refresh_token", refresh_token: "refresh", client_id: "client", client_secret: "secret",
    });
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith("maimai", "player", "cn", expect.stringMatching(/^lxns:\/\/fresh::\/\/refresh::\/\/\d+::\/\/read$/));
  });

  it("names the diving-fish account to fetch", async () => {
    vi.stubEnv("DIVINGFISH_DEV_TOKEN", "developer");
    try {
      expect(await openMaimaiLogin("player", "cn", "divingfish://qq:://12345")).toEqual({ kind: "divingfish", account: { kind: "qq", value: "12345" } });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("deletes SEGA credentials stored for CN instead of submitting them to JP", async () => {
    await expect(openMaimaiLogin("player", "cn", "account://name:://password")).rejects.toThrow("Invalid token format");
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith("maimai", "player", "cn");
    expect(mocks.legacyTls).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
