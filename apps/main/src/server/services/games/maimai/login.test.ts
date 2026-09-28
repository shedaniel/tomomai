import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ page: vi.fn(), gateway: vi.fn(), update: vi.fn(), remove: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/http-agent", () => ({ agentFetch: mocks.page }));
vi.mock("@/lib/request-logger", () => ({ getLogger: () => ({
  info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), child() { return this; },
}) }));
vi.mock("../tokens", () => ({ updateToken: mocks.update, deleteToken: mocks.remove, saveToken: mocks.save }));

import { getCookiesFromRedirect, getGameHtml } from "../sega/http";
import { loginAndGetCookies, processMaimaiToken } from "./login";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", mocks.gateway);
  mocks.page.mockRejectedValue(new Error("Unexpected game-site request"));
  mocks.gateway.mockRejectedValue(new Error("Unexpected gateway request"));
});
afterEach(() => vi.unstubAllGlobals());

describe("SEGA login transport", () => {
  it("refreshes an expired International session and exchanges the game callback", async () => {
    mocks.gateway
      .mockResolvedValueOnce(new Response("Login required"))
      .mockResolvedValueOnce(new Response("", { headers: { "Set-Cookie": "JSESSIONID=gateway; Path=/common_auth/" } }))
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: {
        "Set-Cookie": "clal=renewed; Path=/", Location: "https://maimaidx-eng.com/maimai-mobile/?sid=callback",
      } }));
    mocks.page.mockResolvedValueOnce(new Response(null, { status: 302, headers: { "Set-Cookie": "userId=player; Path=/maimai-mobile/" } }));

    const result = await processMaimaiToken("player", "intl", "account://expired:://name:://p@ss");
    expect(result).toEqual({ isValid: true, redirectUrl: "https://maimaidx-eng.com/maimai-mobile/?sid=callback", token: "renewed" });
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith("maimai", "player", "intl", "account://renewed:://name:://p@ss");
    expect(mocks.remove).not.toHaveBeenCalled();
    const [submitUrl, submit] = mocks.gateway.mock.calls[2];
    expect(new URL(submitUrl).searchParams.get("password")).toBe("p@ss");
    expect(submit.headers.Cookie).toBe("JSESSIONID=gateway");
    const cookies = await getCookiesFromRedirect("maimai", "intl", result.redirectUrl!, null);
    expect(cookies).toBe("userId=player");
    expect(new Headers(mocks.page.mock.calls[0][1].headers).has("Cookie")).toBe(false);
  });

  it("preserves the JP form and card-selection exchange", async () => {
    const initialHeaders = new Headers();
    initialHeaders.append("Set-Cookie", "_t=form-token; Path=/maimai-mobile/");
    initialHeaders.append("Set-Cookie", "session=jp; Path=/maimai-mobile/");
    mocks.page
      .mockResolvedValueOnce(new Response("", { headers: initialHeaders }))
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: "https://maimaidx.jp/maimai-mobile/aimeList/" } }))
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { "Set-Cookie": "userId=selected; Path=/maimai-mobile/" } }));

    expect(await loginAndGetCookies("jp", "account://name:://password")).toBe("userId=selected");
    expect(mocks.page.mock.calls.map(([url]) => String(url))).toEqual([
      "https://maimaidx.jp/maimai-mobile/",
      "https://maimaidx.jp/maimai-mobile/submit/",
      "https://maimaidx.jp/maimai-mobile/aimeList/submit/?idx=0",
    ]);
    expect(new URLSearchParams(mocks.page.mock.calls[1][1].body).get("token")).toBe("form-token");
    expect(new Headers(mocks.page.mock.calls[2][1].headers).get("Cookie")).toBe("_t=form-token; session=jp");
    expect(mocks.gateway).not.toHaveBeenCalled();
  });

  it.each([
    "https://chunithm-net-eng.com/mobile/",
    "https://maimaidx.jp/maimai-mobile/",
  ])("rejects an International cookie callback to another game or region: %s", async location => {
    mocks.gateway.mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: location } }));
    const result = await processMaimaiToken("player", "intl", "cookie://clal=existing");
    expect(result.isValid).toBe(false);
    expect(mocks.page).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("follows game-local page redirects without losing the session", async () => {
    mocks.page
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: "/maimai-mobile/playerData/" } }))
      .mockResolvedValueOnce(new Response("<html>Player</html>"));
    expect(await getGameHtml("maimai", "jp", "https://maimaidx.jp/maimai-mobile/home/", "userId=player", "https://maimaidx.jp/maimai-mobile/")).toBe("<html>Player</html>");
    expect(new Headers(mocks.page.mock.calls[1][1].headers).get("Cookie")).toBe("userId=player");
  });

  it("does not forward a game session to a different game's redirect", async () => {
    mocks.page.mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: "https://new.chunithm-net.com/" } }));
    await expect(getGameHtml("maimai", "jp", "https://maimaidx.jp/maimai-mobile/home/", "userId=player", "https://maimaidx.jp/maimai-mobile/")).rejects.toThrow("Unexpected game site origin");
    expect(mocks.page).toHaveBeenCalledOnce();
  });

  it("rejects a maimai callback before sending CHUNITHM cookies", async () => {
    await expect(getCookiesFromRedirect("chunithm", "intl", "https://maimaidx-eng.com/maimai-mobile/", "userId=chunithm-player")).rejects.toThrow("Unexpected game site origin");
    expect(mocks.page).not.toHaveBeenCalled();
    expect(mocks.gateway).not.toHaveBeenCalled();
  });
});

describe("maimai CN login", () => {
  it("keeps a captured proxy session ready without a SEGA exchange", async () => {
    expect(await loginAndGetCookies("cn", "cn-cookies://userId=cn-player; session=cn")).toBe("userId=cn-player; session=cn");
    expect(mocks.page).not.toHaveBeenCalled();
    expect(mocks.gateway).not.toHaveBeenCalled();
  });

  it("reuses an unexpired Lxns token without a SEGA exchange", async () => {
    const token = `lxns://access:://refresh:://${Date.now() + 60_000}:://read`;
    expect(await processMaimaiToken("player", "cn", token)).toEqual({ isValid: true, token });
    expect(mocks.page).not.toHaveBeenCalled();
    expect(mocks.gateway).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("rejects SEGA credentials for CN instead of submitting them to JP", async () => {
    expect((await processMaimaiToken("player", "cn", "account://name:://password")).isValid).toBe(false);
    expect(mocks.page).not.toHaveBeenCalled();
    expect(mocks.gateway).not.toHaveBeenCalled();
  });
});
