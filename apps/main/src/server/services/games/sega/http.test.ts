import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ agentFetch: vi.fn(), fetch: vi.fn(), warn: vi.fn() }));
vi.mock("@/lib/http-agent", () => ({ agentFetch: mocks.agentFetch }));
vi.mock("@/lib/request-logger", () => ({ getLogger: () => ({ warn: mocks.warn }) }));

import { getCookiesFromRedirect, openGameSite, requestGameSite } from "./http";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.agentFetch.mockRejectedValue(new Error("Unexpected unverified TLS request"));
  mocks.fetch.mockRejectedValue(new Error("Unexpected request"));
});
afterEach(() => vi.unstubAllGlobals());

function redirect(location: string, cookie?: string) {
  return new Response(null, { status: 302, headers: { Location: location, ...(cookie ? { "Set-Cookie": cookie } : {}) } });
}

function sentCookie(call: unknown[]) {
  return new Headers((call[1] as RequestInit).headers).get("Cookie");
}

describe("game site transport", () => {
  it("skips certificate verification only for a site that declares legacy TLS", async () => {
    mocks.agentFetch.mockResolvedValueOnce(new Response("jp"));
    mocks.fetch.mockResolvedValueOnce(new Response("intl"));
    await requestGameSite("maimai", "jp", "playerData/");
    await requestGameSite("maimai", "intl", "playerData/");
    expect(String(mocks.agentFetch.mock.calls[0][0])).toBe("https://maimaidx.jp/maimai-mobile/playerData/");
    expect(String(mocks.fetch.mock.calls[0][0])).toBe("https://maimaidx-eng.com/maimai-mobile/playerData/");
    expect(mocks.agentFetch).toHaveBeenCalledOnce();
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });

  it("resolves paths against each site's mobile root and keeps a caller's user agent", async () => {
    mocks.fetch.mockResolvedValueOnce(new Response("home"));
    await requestGameSite("chunithm", "jp", "home/playerData", { headers: { "User-Agent": "Custom" } });
    const [url, init] = mocks.fetch.mock.calls[0];
    expect(String(url)).toBe("https://new.chunithm-net.com/chuni-mobile/html/mobile/home/playerData");
    expect(new Headers(init.headers).get("User-Agent")).toBe("Custom");
    expect(init.redirect).toBe("manual");
  });
});

describe("game site client", () => {
  it("follows game-local page redirects without losing the session", async () => {
    mocks.agentFetch
      .mockResolvedValueOnce(redirect("/maimai-mobile/playerData/"))
      .mockResolvedValueOnce(new Response("<html>Player</html>"));
    const site = openGameSite("maimai", "jp", { cookies: "userId=player" });
    expect(await site.html("home/")).toBe("<html>Player</html>");
    expect(sentCookie(mocks.agentFetch.mock.calls[1])).toBe("userId=player");
    expect(site.pageUrl).toBe("https://maimaidx.jp/maimai-mobile/playerData/");
  });

  it("does not forward a game session to a different game's redirect", async () => {
    mocks.agentFetch.mockResolvedValueOnce(redirect("https://new.chunithm-net.com/"));
    await expect(openGameSite("maimai", "jp", { cookies: "userId=player" }).html("home/")).rejects.toThrow("Unexpected game site origin");
    expect(mocks.agentFetch).toHaveBeenCalledOnce();
  });

  it("retains rotated cookies on data responses and refuses cross-origin redirects before forwarding them", async () => {
    const session = { cookies: "userId=one; _t=old" };
    const site = openGameSite("chunithm", "intl", session);
    mocks.fetch
      .mockResolvedValueOnce(new Response("Records", { headers: { "Set-Cookie": "_t=new; Path=/mobile/" } }))
      .mockResolvedValueOnce(redirect("https://maimaidx-eng.com/maimai-mobile/", "userId=two; Path=/mobile/"));
    await site.html("record/playlog");
    expect(session.cookies).toBe("userId=one; _t=new");
    await expect(site.html("record/playlog")).rejects.toThrow("Unexpected game site origin");
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(sentCookie(mocks.fetch.mock.calls[1])).toBe("userId=one; _t=new");
  });

  it("sends the previous page as the referer and turns a redirected form post into a read", async () => {
    mocks.fetch
      .mockResolvedValueOnce(new Response("List"))
      .mockResolvedValueOnce(redirect("/mobile/record/musicGenre/master"))
      .mockResolvedValueOnce(new Response("Master"));
    const site = openGameSite("chunithm", "intl", { cookies: "" });
    await site.html("record/musicGenre");
    expect(await site.post("record/musicGenre/sendMaster", new URLSearchParams({ genre: "99" }))).toBe("Master");
    const [, post] = mocks.fetch.mock.calls[1];
    expect(post.method).toBe("POST");
    expect(post.body).toBe("genre=99");
    expect(new Headers(post.headers).get("Referer")).toBe("https://chunithm-net-eng.com/mobile/record/musicGenre");
    const [, follow] = mocks.fetch.mock.calls[2];
    expect(follow.method).toBeUndefined();
    expect(follow.body).toBeUndefined();
  });

  it("rejects a page that is not a success or fails the game's page check", async () => {
    const assertPage = vi.fn((html: string) => {
      if (html.includes("login")) throw new Error("Session expired");
    });
    const site = openGameSite("chunithm", "intl", { cookies: "" }, { assertPage });
    mocks.fetch.mockResolvedValueOnce(new Response("Busy", { status: 503 }));
    await expect(site.html("home/")).rejects.toThrow("CHUNITHM page /mobile/home/ returned HTTP 503");
    mocks.fetch.mockResolvedValueOnce(new Response("login"));
    await expect(site.html("home/")).rejects.toThrow("Session expired");
    expect(assertPage).toHaveBeenCalledExactlyOnceWith("login", "https://chunithm-net-eng.com/mobile/home/");
  });

  it("downloads same-origin files through the session and other hosts without cookies", async () => {
    mocks.fetch
      .mockResolvedValueOnce(new Response("icon", { headers: { "Content-Type": "image/webp" } }))
      .mockResolvedValueOnce(new Response("cdn"));
    const site = openGameSite("chunithm", "intl", { cookies: "userId=player" });
    expect(await site.bytes("/mobile/img/icon.webp")).toEqual({ buffer: Buffer.from("icon"), contentType: "image/webp" });
    expect(await site.bytes("https://cdn.example.test/icon.png")).toMatchObject({ buffer: Buffer.from("cdn") });
    const [sameOrigin, sameInit] = mocks.fetch.mock.calls[0];
    expect(String(sameOrigin)).toBe("https://chunithm-net-eng.com/mobile/img/icon.webp");
    expect(sentCookie(mocks.fetch.mock.calls[0])).toBe("userId=player");
    expect(sameInit.redirect).toBe("manual");
    const [crossOrigin, crossInit] = mocks.fetch.mock.calls[1];
    expect(String(crossOrigin)).toBe("https://cdn.example.test/icon.png");
    expect(new Headers(crossInit.headers).has("Cookie")).toBe(false);
    expect(new Headers(crossInit.headers).has("Referer")).toBe(false);
  });

  it("follows a site file's redirect to another host without the session", async () => {
    mocks.fetch
      .mockResolvedValueOnce(redirect("https://cdn.example.test/photo.jpg", "_t=rotated; Path=/mobile/"))
      .mockResolvedValueOnce(new Response("photo", { headers: { "Content-Type": "image/jpeg" } }));
    const session = { cookies: "userId=player" };
    expect(await openGameSite("chunithm", "intl", session).bytes("img/photo.jpg")).toEqual({ buffer: Buffer.from("photo"), contentType: "image/jpeg" });
    expect(sentCookie(mocks.fetch.mock.calls[0])).toBe("userId=player");
    const [crossOrigin, crossInit] = mocks.fetch.mock.calls[1];
    expect(String(crossOrigin)).toBe("https://cdn.example.test/photo.jpg");
    expect(new Headers(crossInit.headers).has("Cookie")).toBe(false);
    expect(session.cookies).toBe("userId=player; _t=rotated");
  });

  it("rejects a failed download", async () => {
    mocks.fetch.mockResolvedValueOnce(new Response(null, { status: 404 }));
    await expect(openGameSite("chunithm", "intl", { cookies: "" }).bytes("https://cdn.example.test/icon.png"))
      .rejects.toThrow("cdn.example.test/icon.png returned HTTP 404");
  });
});

describe("login redirect exchange", () => {
  it("rejects a maimai callback before sending CHUNITHM cookies", async () => {
    await expect(getCookiesFromRedirect("chunithm", "intl", "https://maimaidx-eng.com/maimai-mobile/", "userId=chunithm-player")).rejects.toThrow("Unexpected game site origin");
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.agentFetch).not.toHaveBeenCalled();
  });
});
