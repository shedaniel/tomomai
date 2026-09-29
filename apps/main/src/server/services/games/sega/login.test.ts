import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ agentFetch: vi.fn(), fetch: vi.fn(), update: vi.fn(), remove: vi.fn(), warn: vi.fn() }));
vi.mock("@/lib/http-agent", () => ({ agentFetch: mocks.agentFetch }));
vi.mock("@/lib/request-logger", () => ({ getLogger: () => ({ info: vi.fn(), warn: mocks.warn, child() { return this; } }) }));
vi.mock("../tokens", () => ({ updateToken: mocks.update, deleteToken: mocks.remove }));

import { SEGA_AIME_GATEWAY } from "@/lib/games/sites";
import { openSegaSession, type SegaLoginConfig } from "./login";

const gateway = { game: "chunithm", region: "intl", kind: "aime-gateway" } as const satisfies SegaLoginConfig;
const cardPath = {
  game: "maimai", region: "jp", kind: "sega-id-site", entryPath: "", formToken: "cookie:_t", cardSelection: { method: "GET", path: "aimeList/submit/?idx=0" },
} as const satisfies SegaLoginConfig;
const cardForm = {
  game: "chunithm", region: "jp", kind: "sega-id-site", entryPath: "/", formToken: "input:token", cardSelection: { method: "POST" },
} as const satisfies SegaLoginConfig;

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.agentFetch.mockRejectedValue(new Error("Unexpected unverified TLS request"));
  mocks.fetch.mockRejectedValue(new Error("Unexpected request"));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function redirect(location: string, ...cookies: string[]) {
  const headers = new Headers({ Location: location });
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  return new Response(null, { status: 302, headers });
}

function page(html: string, ...cookies: string[]) {
  const headers = new Headers();
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  return new Response(html, { headers });
}

function sent(call: unknown[], header: string) {
  return new Headers((call[1] as RequestInit).headers).get(header);
}

describe("credential policy", () => {
  it("deletes a gateway cookie the gateway asks to sign in again", async () => {
    mocks.fetch.mockResolvedValueOnce(page("<form>Login</form>"));
    await expect(openSegaSession(gateway, "player", "cookie://clal=expired")).rejects.toThrow("Token has expired");
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith("chunithm", "player", "intl");
  });

  it("keeps a token when the request fails in transport", async () => {
    mocks.fetch.mockRejectedValueOnce(new TypeError("fetch failed"));
    await expect(openSegaSession(gateway, "player", "cookie://clal=saved")).rejects.toThrow("SEGA service request failed during gateway");
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.warn).toHaveBeenCalledWith(expect.objectContaining({ stepType: "gateway", err: expect.any(TypeError) }), "SEGA login failed");
  });

  it("deletes account credentials the gateway refuses", async () => {
    mocks.fetch
      .mockResolvedValueOnce(page("<form>Login</form>", "JSESSIONID=gateway; Path=/"))
      .mockResolvedValueOnce(page("<form>Wrong password</form>"));
    await expect(openSegaSession(gateway, "player", "account://name:://wrong")).rejects.toThrow("Login failed. Please check your username and password.");
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith("chunithm", "player", "intl");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("keeps account credentials when the gateway answers with a server error", async () => {
    mocks.fetch
      .mockResolvedValueOnce(page("<form>Login</form>", "JSESSIONID=gateway; Path=/"))
      .mockResolvedValueOnce(new Response("Unavailable", { status: 503 }));
    await expect(openSegaSession(gateway, "player", "account://name:://password")).rejects.toThrow("Unexpected response from SEGA servers (503)");
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("deletes credentials a SEGA ID site sends back to its sign-in page", async () => {
    mocks.fetch
      .mockResolvedValueOnce(page('<input name="token" value="login-form">', "PHPSESSID=initial; Path=/"))
      .mockResolvedValueOnce(redirect("https://new.chunithm-net.com/"));
    await expect(openSegaSession(cardForm, "player", "account://name:://wrong")).rejects.toThrow("Login failed");
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith("chunithm", "player", "jp");
  });

  it("keeps credentials when a SEGA ID site answers with a server error", async () => {
    mocks.fetch
      .mockResolvedValueOnce(page('<input name="token" value="login-form">', "PHPSESSID=initial; Path=/"))
      .mockResolvedValueOnce(new Response("Maintenance", { status: 503 }));
    await expect(openSegaSession(cardForm, "player", "account://name:://password")).rejects.toThrow("Unexpected response from SEGA servers (503)");
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it.each([
    [gateway, "lxns://access:://refresh:://0:://read", "Invalid token format"],
    [gateway, "account://name:://", "Username and password cannot be empty"],
    [cardForm, "cookie://clal=existing", "Cookie tokens are not supported in this region"],
  ] as const)("deletes a token %# that cannot sign in without asking SEGA", async (config, token, error) => {
    await expect(openSegaSession(config, "player", token)).rejects.toThrow(error);
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith(config.game, "player", config.region);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("does not delete anything without a user", async () => {
    mocks.fetch.mockResolvedValueOnce(page("<form>Login</form>"));
    await expect(openSegaSession(gateway, null, "cookie://clal=expired")).rejects.toThrow("Token has expired");
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("bounds a stalled response body and keeps the credentials", async () => {
    const deadline = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal);
    mocks.fetch.mockImplementationOnce(async (_url, init: RequestInit) => new Response(new ReadableStream({
      start(controller) {
        init.signal!.addEventListener("abort", () => controller.error(init.signal!.reason), { once: true });
      },
    }), { headers: { "Set-Cookie": "PHPSESSID=test" } }));
    const pending = openSegaSession(cardForm, "player", "account://name:://password");
    await vi.waitFor(() => expect(mocks.fetch).toHaveBeenCalledOnce());
    deadline.abort(new DOMException("Request deadline exceeded", "TimeoutError"));
    await expect(pending).rejects.toThrow("SEGA service request timed out during entry");
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.warn).toHaveBeenCalledWith(expect.objectContaining({ stepType: "entry" }), "SEGA login failed");
  });

  it("propagates the operation abort without deleting credentials", async () => {
    const operation = new AbortController();
    mocks.fetch.mockImplementationOnce((_url, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal!.addEventListener("abort", () => reject(init.signal!.reason), { once: true });
    }));
    const pending = openSegaSession(cardForm, "player", "account://name:://password", operation.signal);
    const timedOut = new Error("Fetch operation timed out after 2 minutes");
    operation.abort(timedOut);
    await expect(pending).rejects.toBe(timedOut);
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});

describe("SEGA Aime gateway", () => {
  it("form-encodes the credentials, keeps the password out of the URL and saves the new gateway session", async () => {
    mocks.fetch
      .mockResolvedValueOnce(page('<input type="hidden" name="retention" value="0">', "JSESSIONID=gateway; Path=/"))
      .mockResolvedValueOnce(redirect("https://chunithm-net-eng.com/mobile/?ssid=exchange", "clal=renewed; Path=/"))
      .mockResolvedValueOnce(redirect("/mobile/home/", "userId=game-session; Path=/mobile/"))
      .mockResolvedValueOnce(page("Home", "_t=game-token; Path=/mobile/"));
    expect(await openSegaSession(gateway, "player", "account://name:://p@ss")).toEqual({ cookies: "userId=game-session; _t=game-token" });

    const [loginUrl, entry] = mocks.fetch.mock.calls[0];
    expect(loginUrl).toBe(SEGA_AIME_GATEWAY.loginUrl("chunithm", "intl"));
    expect(new Headers(entry.headers).has("Cookie")).toBe(false);
    const [submitUrl, submit] = mocks.fetch.mock.calls[1];
    expect(submitUrl).toBe(SEGA_AIME_GATEWAY.submitUrl);
    expect(new URL(submitUrl).search).toBe("");
    expect(submit.method).toBe("POST");
    expect(sent(mocks.fetch.mock.calls[1], "Content-Type")).toBe("application/x-www-form-urlencoded");
    expect(sent(mocks.fetch.mock.calls[1], "Cookie")).toBe("JSESSIONID=gateway");
    expect(Object.fromEntries(new URLSearchParams(submit.body))).toEqual({ retention: "0", sid: "name", password: "p@ss" });
    expect(sent(mocks.fetch.mock.calls[2], "Cookie")).toBe("");
    expect(sent(mocks.fetch.mock.calls[3], "Cookie")).toBe("userId=game-session");
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith("chunithm", "player", "intl", "account://renewed:://name:://p@ss");
  });

  it("falls back to retention 1 when the login form has no retention field", async () => {
    mocks.fetch
      .mockResolvedValueOnce(page("<form></form>", "JSESSIONID=gateway; Path=/"))
      .mockResolvedValueOnce(redirect("https://chunithm-net-eng.com/mobile/?ssid=exchange", "clal=renewed; Path=/"))
      .mockResolvedValueOnce(page("Home", "userId=game-session; Path=/mobile/"));
    await openSegaSession(gateway, "player", "account://name:://password");
    expect(new URLSearchParams(mocks.fetch.mock.calls[1][1].body).get("retention")).toBe("1");
  });

  it("resumes a saved gateway session without signing in again", async () => {
    mocks.fetch
      .mockResolvedValueOnce(redirect("https://chunithm-net-eng.com/mobile/?ssid=exchange"))
      .mockResolvedValueOnce(page("Home", "userId=game-session; Path=/mobile/"));
    expect(await openSegaSession(gateway, "player", "account://saved:://name:://password")).toEqual({ cookies: "userId=game-session" });
    expect(sent(mocks.fetch.mock.calls[0], "Cookie")).toBe("clal=saved");
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("signs in again when the saved gateway session has expired", async () => {
    mocks.fetch
      .mockResolvedValueOnce(page("<form>Login</form>"))
      .mockResolvedValueOnce(page("<form></form>", "JSESSIONID=gateway; Path=/"))
      .mockResolvedValueOnce(redirect("https://chunithm-net-eng.com/mobile/?ssid=exchange", "clal=renewed; Path=/"))
      .mockResolvedValueOnce(page("Home", "userId=game-session; Path=/mobile/"));
    await openSegaSession(gateway, "player", "account://expired:://name:://password");
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith("chunithm", "player", "intl", "account://renewed:://name:://password");
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("refuses a callback to another game's site before sending a request there", async () => {
    mocks.fetch.mockResolvedValueOnce(redirect("https://maimaidx-eng.com/maimai-mobile/"));
    await expect(openSegaSession(gateway, "player", "cookie://clal=existing")).rejects.toThrow("SEGA service request failed during gateway");
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(mocks.agentFetch).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});

describe("SEGA ID site", () => {
  it("selects the first card by path with the sign-in cookies and the form token from the _t cookie", async () => {
    mocks.agentFetch
      .mockResolvedValueOnce(page("", "_t=form-token; Path=/maimai-mobile/", "session=jp; Path=/maimai-mobile/"))
      .mockResolvedValueOnce(redirect("https://maimaidx.jp/maimai-mobile/aimeList/", "session=signed-in; Path=/maimai-mobile/"))
      .mockResolvedValueOnce(redirect("/maimai-mobile/home/", "userId=selected; Path=/maimai-mobile/"))
      .mockResolvedValueOnce(page("Home"));
    expect(await openSegaSession(cardPath, "player", "account://name:://password")).toEqual({ cookies: "_t=form-token; session=signed-in; userId=selected" });
    expect(mocks.agentFetch.mock.calls.map(([url]) => String(url))).toEqual([
      "https://maimaidx.jp/maimai-mobile/",
      "https://maimaidx.jp/maimai-mobile/submit/",
      "https://maimaidx.jp/maimai-mobile/aimeList/submit/?idx=0",
      "https://maimaidx.jp/maimai-mobile/home/",
    ]);
    expect(Object.fromEntries(new URLSearchParams(mocks.agentFetch.mock.calls[1][1].body))).toEqual({ segaId: "name", password: "password", token: "form-token" });
    expect(sent(mocks.agentFetch.mock.calls[1], "Referer")).toBe("https://maimaidx.jp/maimai-mobile/");
    expect(sent(mocks.agentFetch.mock.calls[2], "Cookie")).toBe("_t=form-token; session=signed-in");
    expect(sent(mocks.agentFetch.mock.calls[2], "Referer")).toBe("https://maimaidx.jp/maimai-mobile/");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("submits the card list's form with the form token from the sign-in page", async () => {
    mocks.fetch
      .mockResolvedValueOnce(page('<input name="token" value="login-form">', "PHPSESSID=initial; Path=/"))
      .mockResolvedValueOnce(redirect("/chuni-mobile/html/mobile/aimeList/", "PHPSESSID=authenticated; Path=/"))
      .mockResolvedValueOnce(page('<form action="/chuni-mobile/html/mobile/aimeList/submit/"><input type="hidden" name="idx" value="3"><input type="hidden" name="token" value="card-form"></form>', "_t=card-cookie; Path=/"))
      .mockResolvedValueOnce(redirect("/chuni-mobile/html/mobile/home/", "userId=selected; Path=/"))
      .mockResolvedValueOnce(page("Home", "_t=home-cookie; Path=/"));
    expect(await openSegaSession(cardForm, "player", "account://name:://p@ss")).toEqual({ cookies: "PHPSESSID=authenticated; _t=home-cookie; userId=selected" });
    expect(mocks.fetch.mock.calls.map(([url]) => String(url))).toEqual([
      "https://new.chunithm-net.com/",
      "https://new.chunithm-net.com/chuni-mobile/html/mobile/submit/",
      "https://new.chunithm-net.com/chuni-mobile/html/mobile/aimeList/",
      "https://new.chunithm-net.com/chuni-mobile/html/mobile/aimeList/submit/",
      "https://new.chunithm-net.com/chuni-mobile/html/mobile/home/",
    ]);
    expect(Object.fromEntries(new URLSearchParams(mocks.fetch.mock.calls[1][1].body))).toEqual({ segaId: "name", password: "p@ss", token: "login-form" });
    expect(sent(mocks.fetch.mock.calls[2], "Referer")).toBe("https://new.chunithm-net.com/");
    const [, card] = mocks.fetch.mock.calls[3];
    expect(card.method).toBe("POST");
    expect(Object.fromEntries(new URLSearchParams(card.body))).toEqual({ idx: "3", token: "card-form" });
    expect(sent(mocks.fetch.mock.calls[3], "Cookie")).toBe("PHPSESSID=authenticated; _t=card-cookie");
    expect(sent(mocks.fetch.mock.calls[3], "Referer")).toBe("https://new.chunithm-net.com/chuni-mobile/html/mobile/aimeList/");
    expect(mocks.fetch.mock.calls[4][1].body).toBeUndefined();
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("keeps credentials when no card can be selected", async () => {
    mocks.fetch
      .mockResolvedValueOnce(page('<input name="token" value="login-form">', "PHPSESSID=initial; Path=/"))
      .mockResolvedValueOnce(redirect("/chuni-mobile/html/mobile/aimeList/", "PHPSESSID=authenticated; Path=/"))
      .mockResolvedValueOnce(page("<p>No cards</p>"));
    await expect(openSegaSession(cardForm, "player", "account://name:://password")).rejects.toThrow("SEGA service request failed during card-list");
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});
