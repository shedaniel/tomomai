import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), update: vi.fn(), remove: vi.fn() }));
vi.mock("@/lib/http-agent", () => ({ agentFetch: vi.fn() }));
vi.mock("@/lib/request-logger", () => ({ getLogger: () => ({ info: vi.fn(), warn: vi.fn(), child() { return this; } }) }));
vi.mock("../tokens", () => ({ updateToken: mocks.update, deleteToken: mocks.remove }));

import { getGame } from "@/lib/games/registry";
import { getGameSite } from "@/lib/games/sites";
import { chunithmSegaLogin, loginAndGetCookies } from "./login";

beforeEach(() => { vi.resetAllMocks(); vi.stubGlobal("fetch", mocks.fetch); });
afterEach(() => vi.unstubAllGlobals());

function redirect(location: string, cookie?: string) {
  return new Response(null, { status: 302, headers: { Location: location, ...(cookie ? { "Set-Cookie": cookie } : {}) } });
}

describe("CHUNITHM SEGA login", () => {
  it("configures a SEGA login for each region that offers one, through the gateway where the site has one", () => {
    const { loginMethods } = getGame("chunithm");
    const segaRegions = Object.entries(loginMethods)
      .filter(([, methods]) => methods.includes("sega-account") || methods.includes("sega-cookie"))
      .map(([region]) => region);
    expect(Object.keys(chunithmSegaLogin).sort()).toEqual(segaRegions.sort());
    for (const config of Object.values(chunithmSegaLogin)) {
      expect(config.kind === "aime-gateway").toBe(getGameSite("chunithm", config.region)?.aime !== undefined);
      if (loginMethods[config.region]?.includes("sega-cookie")) expect(config.kind).toBe("aime-gateway");
    }
  });

  it("rejects a region CHUNITHM has no site for before any request", async () => {
    await expect(loginAndGetCookies("cn", "cookie://clal=existing", "internal-user"))
      .rejects.toMatchObject({ code: "UNSUPPORTED_REGION", game: "chunithm", region: "cn" });
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("exchanges an International gateway cookie through the CHUNITHM gateway site", async () => {
    mocks.fetch
      .mockResolvedValueOnce(redirect("https://chunithm-net-eng.com/mobile/?ssid=exchange"))
      .mockResolvedValueOnce(redirect("/mobile/home/", "userId=game-session; Path=/mobile/"))
      .mockResolvedValueOnce(new Response("Home", { headers: { "Set-Cookie": "_t=game-token; Path=/mobile/" } }));
    expect(await loginAndGetCookies("intl", "cookie://clal=existing", "internal-user")).toBe("userId=game-session; _t=game-token");
    const [gatewayUrl, gatewayRequest] = mocks.fetch.mock.calls[0];
    expect(Object.fromEntries(new URL(gatewayUrl).searchParams)).toEqual({
      site_id: "chuniex", redirect_url: "https://chunithm-net-eng.com/mobile/", back_url: "https://chunithm.sega.com/",
    });
    expect(new Headers(gatewayRequest.headers).get("Cookie")).toBe("clal=existing");
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("signs JP players in from the sign-in form on the site root and submits the card form", async () => {
    mocks.fetch
      .mockResolvedValueOnce(new Response('<input name="token" value="login-form">', { headers: { "Set-Cookie": "PHPSESSID=initial; Path=/" } }))
      .mockResolvedValueOnce(redirect("/chuni-mobile/html/mobile/aimeList/", "PHPSESSID=authenticated; Path=/"))
      .mockResolvedValueOnce(new Response('<form action="/chuni-mobile/html/mobile/aimeList/submit/"><input type="hidden" name="idx" value="0"><input type="hidden" name="token" value="card-form"></form>'))
      .mockResolvedValueOnce(new Response("Home", { headers: { "Set-Cookie": "userId=selected; Path=/" } }));
    expect(await loginAndGetCookies("jp", "account://name:://password", "internal-user")).toBe("PHPSESSID=authenticated; userId=selected");
    expect(mocks.fetch.mock.calls.map(([url]) => String(url))).toEqual([
      "https://new.chunithm-net.com/",
      "https://new.chunithm-net.com/chuni-mobile/html/mobile/submit/",
      "https://new.chunithm-net.com/chuni-mobile/html/mobile/aimeList/",
      "https://new.chunithm-net.com/chuni-mobile/html/mobile/aimeList/submit/",
    ]);
  });

  it("refuses International cookie tokens for JP and deletes them", async () => {
    await expect(loginAndGetCookies("jp", "cookie://existing", "internal-user")).rejects.toThrow("Cookie tokens are not supported");
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith("chunithm", "internal-user", "jp");
  });
});
