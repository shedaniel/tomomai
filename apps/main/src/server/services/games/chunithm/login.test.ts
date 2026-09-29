import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), update: vi.fn(), remove: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/http-agent", () => ({ agentFetch: vi.fn() }));
vi.mock("@/lib/request-logger", () => ({ getLogger: () => ({ info: vi.fn(), error: mocks.error, child() { return this; } }) }));
vi.mock("../tokens", () => ({ updateToken: mocks.update, deleteToken: mocks.remove }));

import { SEGA_AIME_GATEWAY } from "@/lib/games/sites";
import { loginAndGetCookies } from "./login";

beforeEach(() => { vi.resetAllMocks(); vi.stubGlobal("fetch", mocks.fetch); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function redirect(location: string, cookie?: string) {
  return new Response(null, { status: 302, headers: { Location: location, ...(cookie ? { "Set-Cookie": cookie } : {}) } });
}

describe("CHUNITHM authentication", () => {
  it("rejects a region CHUNITHM has no site for before any request", async () => {
    await expect(loginAndGetCookies("cn", "cookie://clal=existing", "internal-user"))
      .rejects.toMatchObject({ code: "UNSUPPORTED_REGION", game: "chunithm", region: "cn" });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("exchanges an International gateway cookie without sending it to the game origin", async () => {
    mocks.fetch
      .mockResolvedValueOnce(redirect("https://chunithm-net-eng.com/mobile/?ssid=exchange"))
      .mockResolvedValueOnce(redirect("/mobile/home/", "userId=game-session; Path=/mobile/"))
      .mockResolvedValueOnce(new Response("Home", { headers: { "Set-Cookie": "_t=game-token; Path=/mobile/" } }));
    expect(await loginAndGetCookies("intl", "cookie://clal=existing", "internal-user")).toBe("userId=game-session; _t=game-token");
    const [gatewayUrl, gatewayRequest] = mocks.fetch.mock.calls[0];
    expect(new URL(gatewayUrl).searchParams.get("site_id")).toBe("chuniex");
    expect(new Headers(gatewayRequest.headers).get("Cookie")).toBe("clal=existing");
    expect(new Headers(mocks.fetch.mock.calls[1][1].headers).get("Cookie")).toBe("");
    expect(new Headers(mocks.fetch.mock.calls[2][1].headers).get("Cookie")).toBe("userId=game-session");
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("expires only the CHUNITHM token and refuses another game's callback", async () => {
    mocks.fetch.mockResolvedValueOnce(new Response("Login required"));
    await expect(loginAndGetCookies("intl", "cookie://expired", "internal-user")).rejects.toThrow("Token has expired");
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith("chunithm", "internal-user", "intl");
    mocks.fetch.mockResolvedValueOnce(redirect("https://maimaidx-eng.com/maimai-mobile/"));
    await expect(loginAndGetCookies("intl", "cookie://existing", "internal-user")).rejects.toThrow("Failed to validate token");
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    await expect(loginAndGetCookies("jp", "cookie://existing", "internal-user")).rejects.toThrow("Cookie format is not supported");
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it("submits the observed JP card form and carries response cookies across the full session", async () => {
    mocks.fetch
      .mockResolvedValueOnce(new Response('<input name="token" value="login-form">', { headers: { "Set-Cookie": "PHPSESSID=initial; Path=/" } }))
      .mockResolvedValueOnce(redirect("/chuni-mobile/html/mobile/aimeList/", "PHPSESSID=authenticated; Path=/"))
      .mockResolvedValueOnce(new Response('<form action="/chuni-mobile/html/mobile/aimeList/submit/"><input type="hidden" name="idx" value="3"><input type="hidden" name="token" value="card-form"></form>', { headers: { "Set-Cookie": "_t=card-cookie; Path=/" } }))
      .mockResolvedValueOnce(redirect("/chuni-mobile/html/mobile/home/", "userId=selected; Path=/"))
      .mockResolvedValueOnce(new Response("Home", { headers: { "Set-Cookie": "_t=home-cookie; Path=/" } }));
    expect(await loginAndGetCookies("jp", "account://name:://p@ss", "internal-user")).toBe("PHPSESSID=authenticated; _t=home-cookie; userId=selected");
    expect(mocks.fetch.mock.calls.slice(0, 3).map(([url]) => String(url))).toEqual([
      "https://new.chunithm-net.com/",
      "https://new.chunithm-net.com/chuni-mobile/html/mobile/submit/",
      "https://new.chunithm-net.com/chuni-mobile/html/mobile/aimeList/",
    ]);
    const [, login] = mocks.fetch.mock.calls[1];
    expect(Object.fromEntries(new URLSearchParams(login.body))).toEqual({ segaId: "name", password: "p@ss", token: "login-form" });
    const [cardUrl, card] = mocks.fetch.mock.calls[3];
    expect(String(cardUrl)).toBe("https://new.chunithm-net.com/chuni-mobile/html/mobile/aimeList/submit/");
    expect(card.method).toBe("POST");
    expect(Object.fromEntries(new URLSearchParams(card.body))).toEqual({ idx: "3", token: "card-form" });
    expect(new Headers(card.headers).get("Cookie")).toBe("PHPSESSID=authenticated; _t=card-cookie");
    expect(mocks.fetch.mock.calls[4][1].body).toBeUndefined();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("uses International form bodies and exchanges only game cookies while refreshing the stored account token", async () => {
    mocks.fetch
      .mockResolvedValueOnce(new Response('<input name="retention" value="1">', { headers: { "Set-Cookie": "JSESSIONID=gateway; Path=/" } }))
      .mockResolvedValueOnce(redirect("https://chunithm-net-eng.com/mobile/?ssid=exchange", "clal=renewed; Path=/"))
      .mockResolvedValueOnce(redirect("/mobile/home/", "userId=game-session; Path=/mobile/"))
      .mockResolvedValueOnce(new Response("Home", { headers: { "Set-Cookie": "_t=game-token; Path=/mobile/" } }));
    expect(await loginAndGetCookies("intl", "account://name:://p@ss", "internal-user")).toBe("userId=game-session; _t=game-token");
    const [submitUrl, submit] = mocks.fetch.mock.calls[1];
    expect(submitUrl).toBe(SEGA_AIME_GATEWAY.submitUrl);
    expect(Object.fromEntries(new URLSearchParams(submit.body))).toEqual({ retention: "1", sid: "name", password: "p@ss" });
    expect(new Headers(mocks.fetch.mock.calls[2][1].headers).get("Cookie")).toBe("");
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith("chunithm", "internal-user", "intl", "account://renewed:://name:://p@ss");
  });
});

it("bounds a stalled login response body and preserves credentials with the failed phase", async () => {
  const deadline = new AbortController();
  vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal);
  mocks.fetch.mockImplementationOnce(async (_url, init: RequestInit) => new Response(new ReadableStream({
    start(controller) {
      init.signal!.addEventListener("abort", () => controller.error(init.signal!.reason), { once: true });
    },
  }), { headers: { "Set-Cookie": "PHPSESSID=test" } }));
  const pending = loginAndGetCookies("jp", "account://name:://password", "internal-user");
  await vi.waitFor(() => expect(mocks.fetch).toHaveBeenCalledOnce());
  deadline.abort(new DOMException("Request deadline exceeded", "TimeoutError"));
  await expect(pending).rejects.toThrow("SEGA service request timed out during entry");
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(mocks.error).toHaveBeenCalledWith(expect.objectContaining({ stepType: "entry" }), "SEGA account login failed");
});

it("propagates the operation abort through a pending login request without deleting credentials", async () => {
  const operation = new AbortController();
  mocks.fetch.mockImplementationOnce((_url, init: RequestInit) => new Promise((_resolve, reject) => {
    init.signal!.addEventListener("abort", () => reject(init.signal!.reason), { once: true });
  }));
  const pending = loginAndGetCookies("jp", "account://name:://password", "internal-user", operation.signal);
  const timedOut = new Error("Fetch operation timed out after 2 minutes");
  operation.abort(timedOut);
  await expect(pending).rejects.toBe(timedOut);
  expect(mocks.remove).not.toHaveBeenCalled();
});

it("retains an account token when credential submission fails in transport", async () => {
  mocks.fetch
    .mockResolvedValueOnce(new Response('<input name="token" value="form-token">', { headers: { "Set-Cookie": "PHPSESSID=test" } }))
    .mockRejectedValueOnce(new TypeError("fetch failed"));
  await expect(loginAndGetCookies("jp", "account://name:://password", "internal-user"))
    .rejects.toThrow("SEGA service request failed during credentials");
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(mocks.error).toHaveBeenCalledWith(expect.objectContaining({ stepType: "credentials" }), "SEGA account login failed");
});
