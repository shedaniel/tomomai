import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ legacyTls: vi.fn(), fetch: vi.fn(), update: vi.fn(), remove: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/http-agent", () => ({ agentFetch: mocks.legacyTls }));
vi.mock("@/lib/request-logger", () => ({ getLogger: () => ({
  info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), child() { return this; },
}) }));
vi.mock("../tokens", () => ({ updateToken: mocks.update, deleteToken: mocks.remove, saveToken: mocks.save }));

import { getCookiesFromRedirect } from "../sega/http";
import { loginAndGetCookies, processMaimaiToken } from "./login";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.legacyTls.mockRejectedValue(new Error("Unexpected unverified TLS request"));
  mocks.fetch.mockRejectedValue(new Error("Unexpected request"));
});
afterEach(() => vi.unstubAllGlobals());

describe("SEGA login transport", () => {
  it("refreshes an expired International session and exchanges the game callback", async () => {
    mocks.fetch
      .mockResolvedValueOnce(new Response("Login required"))
      .mockResolvedValueOnce(new Response("", { headers: { "Set-Cookie": "JSESSIONID=gateway; Path=/common_auth/" } }))
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: {
        "Set-Cookie": "clal=renewed; Path=/", Location: "https://maimaidx-eng.com/maimai-mobile/?sid=callback",
      } }))
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { "Set-Cookie": "userId=player; Path=/maimai-mobile/" } }));

    const result = await processMaimaiToken("player", "intl", "account://expired:://name:://p@ss");
    expect(result).toEqual({ isValid: true, redirectUrl: "https://maimaidx-eng.com/maimai-mobile/?sid=callback", token: "renewed" });
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith("maimai", "player", "intl", "account://renewed:://name:://p@ss");
    expect(mocks.remove).not.toHaveBeenCalled();
    const [loginUrl] = mocks.fetch.mock.calls[1];
    expect(Object.fromEntries(new URL(loginUrl).searchParams)).toEqual({
      site_id: "maimaidxex", redirect_url: "https://maimaidx-eng.com/maimai-mobile/", back_url: "https://maimai.sega.com/",
    });
    const [submitUrl, submit] = mocks.fetch.mock.calls[2];
    expect(new URL(submitUrl).searchParams.get("password")).toBe("p@ss");
    expect(submit.headers.Cookie).toBe("JSESSIONID=gateway");
    const cookies = await getCookiesFromRedirect("maimai", "intl", result.redirectUrl!, null);
    expect(cookies).toBe("userId=player");
    const [exchangeUrl, exchange] = mocks.fetch.mock.calls[3];
    expect(String(exchangeUrl)).toBe("https://maimaidx-eng.com/maimai-mobile/?sid=callback");
    expect(new Headers(exchange.headers).has("Cookie")).toBe(false);
    expect(mocks.legacyTls).not.toHaveBeenCalled();
  });

  it("preserves the JP form and card-selection exchange", async () => {
    const initialHeaders = new Headers();
    initialHeaders.append("Set-Cookie", "_t=form-token; Path=/maimai-mobile/");
    initialHeaders.append("Set-Cookie", "session=jp; Path=/maimai-mobile/");
    mocks.legacyTls
      .mockResolvedValueOnce(new Response("", { headers: initialHeaders }))
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: "https://maimaidx.jp/maimai-mobile/aimeList/" } }))
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { "Set-Cookie": "userId=selected; Path=/maimai-mobile/" } }));

    expect(await loginAndGetCookies("jp", "account://name:://password")).toBe("userId=selected");
    expect(mocks.legacyTls.mock.calls.map(([url]) => String(url))).toEqual([
      "https://maimaidx.jp/maimai-mobile/",
      "https://maimaidx.jp/maimai-mobile/submit/",
      "https://maimaidx.jp/maimai-mobile/aimeList/submit/?idx=0",
    ]);
    expect(new URLSearchParams(mocks.legacyTls.mock.calls[1][1].body).get("token")).toBe("form-token");
    expect(new Headers(mocks.legacyTls.mock.calls[2][1].headers).get("Cookie")).toBe("_t=form-token; session=jp");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it.each([
    "https://chunithm-net-eng.com/mobile/",
    "https://maimaidx.jp/maimai-mobile/",
  ])("rejects an International cookie callback to another game or region: %s", async location => {
    mocks.fetch.mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: location } }));
    const result = await processMaimaiToken("player", "intl", "cookie://clal=existing");
    expect(result.isValid).toBe(false);
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(mocks.legacyTls).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

describe("maimai CN login", () => {
  it("keeps a captured proxy session ready without a SEGA exchange", async () => {
    expect(await loginAndGetCookies("cn", "cn-cookies://userId=cn-player; session=cn")).toBe("userId=cn-player; session=cn");
    expect(mocks.legacyTls).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("reuses an unexpired Lxns token without a SEGA exchange", async () => {
    const token = `lxns://access:://refresh:://${Date.now() + 60_000}:://read`;
    expect(await processMaimaiToken("player", "cn", token)).toEqual({ isValid: true, token });
    expect(mocks.legacyTls).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("rejects SEGA credentials for CN instead of submitting them to JP", async () => {
    expect((await processMaimaiToken("player", "cn", "account://name:://password")).isValid).toBe(false);
    expect(mocks.legacyTls).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
