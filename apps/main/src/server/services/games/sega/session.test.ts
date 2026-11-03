import { createServer, type IncomingMessage, type Server, type ServerResponse } from "http";
import type { AddressInfo, Socket } from "net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), debug: vi.fn(), info: vi.fn(), error: vi.fn() } }));

// maimai DX NET INTL, served by the local model below.
const site = vi.hoisted(() => ({ origin: "" }));
vi.mock("@/lib/games/registry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/games/registry")>();
  return {
    ...actual,
    getGame: (id: Parameters<typeof actual.getGame>[0]) => {
      const game = actual.getGame(id);
      if (id !== "maimai") return game;
      return { ...game, sites: { ...game.sites, intl: { ...game.sites.intl!, origin: site.origin } } };
    },
  };
});

import { GameSiteLockedError } from "./errors";
import { describeSegaError, openGameSite, redeemGameSession, releaseGameSiteSession, type GameSiteSession } from "./http";

// Models maimai DX NET: each connection comes from a network, a redemption
// binds the session to the redeeming connection's network and replaces the
// previous session, and anything else is redirected to the error page.
type NetSocket = Socket & { network: string; id: number };

let server: Server;
let base: string;
let networks: string[];
let connectionCount: number;
let openSockets: Set<Socket>;
let netSession: { id: number; network: string } | null;
let redemptions: number;
let failRedemptions: number;
let errorCode: string;
let imageRejection: "404" | "empty";
// maimai's rate-limit lock (ERROR CODE 200001): redemptions land on the error
// page with only _t/userId, and every page is redirected there.
let locked: boolean;
let redemptionAttempts: number;
let pageRequests: number;
// SEGA may reset the session cookie when it turns a request away.
let rejectionCookie: string | null;

function handle(req: IncomingMessage, res: ServerResponse) {
  const socket = req.socket as NetSocket;
  const url = req.url!;
  if (url.startsWith("/maimai-mobile/?ssid=")) {
    redemptionAttempts++;
    if (locked) {
      res.writeHead(302, { Location: "/maimai-mobile/error/", "Set-Cookie": ["userId=0; path=/", "_t=t; path=/"] }).end();
      return;
    }
    if (failRedemptions > 0) {
      failRedemptions--;
      res.writeHead(404).end("not found");
      return;
    }
    redemptions++;
    netSession = { id: redemptions, network: socket.network };
    res.writeHead(302, { Location: "/maimai-mobile/home/", "Set-Cookie": [`userId=${redemptions}; path=/`, "_t=t; path=/"] }).end();
    return;
  }
  if (url === "/maimai-mobile/error/") {
    const code = locked ? "200001" : errorCode;
    res.writeHead(200).end(`<div class="container_red p_10"><div class="p_5 f_14 ">ERROR CODE：${code}</div><div class="p_5 f_12 gray break">Reason ${code}.<br>Try again.</div></div>`);
    return;
  }
  pageRequests++;
  if (locked) {
    res.writeHead(302, { Location: "/maimai-mobile/error/" }).end();
    return;
  }
  if (url.startsWith("/maimai-mobile/img/")) {
    if (socket.network !== "home") {
      if (imageRejection === "404") res.writeHead(404).end("not found");
      else res.writeHead(200, { "Content-Type": "image/png" }).end();
      return;
    }
    res.writeHead(200, { "Content-Type": "image/png" }).end(`img ${url}`);
    return;
  }
  const cookieId = Number(req.headers.cookie?.match(/userId=(\d+)/)?.[1]);
  const valid = netSession !== null && cookieId === netSession.id && socket.network === netSession.network;
  const reply = () => {
    if (!valid) res.writeHead(302, { Location: "/maimai-mobile/error/", ...(rejectionCookie ? { "Set-Cookie": [rejectionCookie] } : {}) }).end();
    else if (url === "/maimai-mobile/missing/") res.writeHead(404).end("not found");
    else res.writeHead(200).end(`ok ${url}`);
  };
  if (url.startsWith("/maimai-mobile/slow/")) setTimeout(reply, 50);
  else reply();
}

beforeEach(async () => {
  networks = [];
  connectionCount = 0;
  openSockets = new Set();
  netSession = null;
  redemptions = 0;
  failRedemptions = 0;
  errorCode = "100001";
  imageRejection = "404";
  locked = false;
  redemptionAttempts = 0;
  pageRequests = 0;
  rejectionCookie = null;
  server = createServer(handle);
  server.on("connection", (socket: NetSocket) => {
    socket.id = connectionCount;
    socket.network = networks[connectionCount++] ?? "home";
    openSockets.add(socket);
    socket.on("close", () => openSockets.delete(socket));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  site.origin = base;
});

afterEach(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 50));
const open = () => redeemGameSession("maimai", "intl", { url: `${base}/maimai-mobile/?ssid=abc`, cookies: "" });
const client = (session: GameSiteSession) => openGameSite("maimai", "intl", session);
const page = (session: GameSiteSession, path: string) => client(session).html(path);
const file = async (session: GameSiteSession, path: string) => (await client(session).bytes(`${base}/maimai-mobile/${path}`)).buffer.toString();

describe("game site sessions", () => {
  it("spreads requests over helper connections when their network is accepted", async () => {
    const session = await open();

    const pages = await Promise.all(Array.from({ length: 12 }, (_, i) => page(session, `page${i}/`)));

    expect(pages).toEqual(Array.from({ length: 12 }, (_, i) => `ok /maimai-mobile/page${i}/`));
    expect(connectionCount).toBe(4);
    releaseGameSiteSession(session);
  });

  it("retires helpers whose network is rejected and keeps the session on the primary", async () => {
    networks = ["home", "away", "away", "away"];
    const session = await open();

    for (let i = 0; i < 12; i++) expect(await page(session, `page${i}/`)).toBe(`ok /maimai-mobile/page${i}/`);
    for (let i = 0; i < 8; i++) await page(session, "record/");

    expect(connectionCount).toBe(4);
    expect(redemptions).toBe(1);
    await settle();
    expect(openSockets.size).toBe(1);
    releaseGameSiteSession(session);
  });

  it("keeps the session's cookies when a rejected helper's response tries to reset them", async () => {
    networks = ["home", "away", "away", "away"];
    rejectionCookie = "userId=0; path=/";
    const session = await open();

    const pages = await Promise.all(Array.from({ length: 12 }, (_, i) => page(session, `page${i}/`)));

    expect(pages).toEqual(Array.from({ length: 12 }, (_, i) => `ok /maimai-mobile/page${i}/`));
    expect(redemptions).toBe(1);
    expect(session.cookies).toBe("userId=1; _t=t");
    releaseGameSiteSession(session);
  });

  it("redeems again on a fresh connection when the session dies", async () => {
    const session = await open();
    await Promise.all(Array.from({ length: 4 }, () => page(session, "home/")));
    expect(connectionCount).toBe(4);

    netSession = null;
    const pages = await Promise.all(Array.from({ length: 8 }, (_, i) => page(session, `page${i}/`)));

    expect(pages).toEqual(Array.from({ length: 8 }, (_, i) => `ok /maimai-mobile/page${i}/`));
    expect(redemptions).toBe(2);
    releaseGameSiteSession(session);
  });

  it("fetches a file missing on the primary's server through another connection", async () => {
    const session = await open();
    const original = handle;
    server.removeAllListeners("request");
    server.on("request", (req, res) => {
      if (req.url === "/maimai-mobile/img/photo/a" && (req.socket as NetSocket).id === 0) return res.writeHead(404).end("not found");
      return original(req, res);
    });

    expect(await file(session, "img/photo/a")).toBe("img /maimai-mobile/img/photo/a");
    expect(redemptions).toBe(1);
    await settle();
    expect(openSockets.size).toBe(1);
    releaseGameSiteSession(session);
  });

  it("retries an empty body through another connection", async () => {
    const session = await open();
    let served = 0;
    const original = handle;
    server.removeAllListeners("request");
    server.on("request", (req, res) => {
      if (req.url === "/maimai-mobile/img/photo/a" && served++ === 0) return res.writeHead(200).end();
      return original(req, res);
    });

    expect(await file(session, "img/photo/a")).toBe("img /maimai-mobile/img/photo/a");
    expect(redemptions).toBe(1);
    releaseGameSiteSession(session);
  });

  it("gives up after the redeem limit and reports the error code", async () => {
    const session = await open();
    errorCode = "200002";
    const original = handle;
    server.removeAllListeners("request");
    server.on("request", (req, res) => {
      if (req.url!.startsWith("/maimai-mobile/?ssid=")) return original(req, res);
      if (req.url === "/maimai-mobile/error/") return original(req, res);
      res.writeHead(302, { Location: "/maimai-mobile/error/" }).end();
    });

    await expect(page(session, "playerData/")).rejects.toThrow("maimai DX NET did not serve /maimai-mobile/playerData/ ERROR CODE 200002: Reason 200002. Try again.");
    expect(redemptions).toBe(3);
    releaseGameSiteSession(session);
  });

  it("lets the game's page check name an expired session instead of returning the error page", async () => {
    const assertPage = vi.fn((html: string) => {
      if (html.includes("ERROR CODE：100001")) throw new Error("Session expired or invalid. Please provide a new token.");
    });

    await expect(openGameSite("maimai", "intl", { cookies: "other=1" }, { assertPage }).html("playerData/")).rejects.toThrow("Session expired");
    expect(assertPage).toHaveBeenCalledOnce();
  });

  it("returns a genuine 404 without redeeming or leaking connections", async () => {
    const session = await open();

    await expect(page(session, "missing/")).rejects.toThrow("returned HTTP 404");
    expect(redemptions).toBe(1);
    await settle();
    expect(openSockets.size).toBe(1);
    releaseGameSiteSession(session);
  });

  it("retries a redemption that set no cookies", async () => {
    failRedemptions = 2;

    const session = await open();

    expect(session.cookies).toBe("userId=1; _t=t");
    expect(await page(session, "home/")).toBe("ok /maimai-mobile/home/");
    await settle();
    expect(openSockets.size).toBe(1);
    releaseGameSiteSession(session);
  });

  it("closes every connection on release", async () => {
    const session = await open();
    await Promise.all(Array.from({ length: 4 }, () => page(session, "home/")));
    expect(openSockets.size).toBe(4);

    releaseGameSiteSession(session);
    await settle();

    expect(openSockets.size).toBe(0);
  });

  it("stops a request that is being retried when the session is released", async () => {
    networks = ["home", "away"];
    const session = await open();
    await page(session, "home/");

    const pending = page(session, "slow/");
    await new Promise((resolve) => setTimeout(resolve, 10));
    releaseGameSiteSession(session);

    await expect(pending).rejects.toThrow();
    await settle();
    expect(openSockets.size).toBe(0);
    expect(connectionCount).toBe(2);
  });

  it("doesn't retry pages without a session", async () => {
    netSession = null;

    await expect(page({ cookies: "other=1" }, "home/")).rejects.toThrow("did not serve");
    expect(pageRequests).toBe(1);
  });
});

describe("the rate-limit lock (ERROR CODE 200001)", () => {
  it("stops a fetch at the first locked response instead of retrying", async () => {
    const session = await open();
    locked = true;

    const results = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => page(session, `page${i}/`)));

    expect(results.every((r) => r.status === "rejected" && r.reason instanceof GameSiteLockedError)).toBe(true);
    expect(pageRequests).toBeLessThanOrEqual(8);
    expect(redemptionAttempts).toBe(1);
    await expect(page(session, "later/")).rejects.toBeInstanceOf(GameSiteLockedError);
    expect(pageRequests).toBeLessThanOrEqual(8);
    releaseGameSiteSession(session);
  });

  it("treats a redemption sent to the error page as a failed login, without retrying", async () => {
    locked = true;

    await expect(open()).rejects.toBeInstanceOf(GameSiteLockedError);
    expect(redemptionAttempts).toBe(1);
    await settle();
    expect(openSockets.size).toBe(0);
  });

  it("reports other error codes from a refused redemption", async () => {
    server.removeAllListeners("request");
    server.on("request", (req, res) => {
      if (req.url!.startsWith("/maimai-mobile/?ssid=")) {
        redemptionAttempts++;
        return res.writeHead(302, { Location: "/maimai-mobile/error/", "Set-Cookie": ["userId=0; path=/"] }).end();
      }
      return handle(req, res);
    });
    errorCode = "100001";

    await expect(open()).rejects.toThrow("maimai DX NET refused the login redirect ERROR CODE 100001: Reason 100001. Try again.");
    expect(redemptionAttempts).toBe(1);
  });

  it("doesn't retry a locked image request without a session", async () => {
    locked = true;

    await expect(file({ cookies: "" }, "img/Icon/a.png")).rejects.toBeInstanceOf(GameSiteLockedError);
    expect(pageRequests).toBe(1);
  });
});

describe("file requests", () => {
  it("treats an empty 200 as a rejection and retries on the primary", async () => {
    networks = ["home", "away"];
    imageRejection = "empty";
    const session = await open();
    await page(session, "home/");

    expect(await file(session, "img/Icon/a.png")).toBe("img /maimai-mobile/img/Icon/a.png");
    releaseGameSiteSession(session);
  });

  it("retries a rejected image without a session and closes the throwaway connections", async () => {
    networks = ["away", "away", "home"];

    expect(await file({ cookies: "" }, "img/Icon/a.png")).toBe("img /maimai-mobile/img/Icon/a.png");
    await settle();
    // Only the shared agent's keep-alive connection (the first attempt) may stay open.
    expect(openSockets.size).toBeLessThanOrEqual(1);
  });
});

describe("describeSegaError", () => {
  it("reads the code and reason from SEGA's error page", () => {
    const html = `
      <img src="https://maimaidx-eng.com/maimai-mobile/img/title_error.png" class="title m_10"/>
      <div class="container_red p_10">
        <div class="p_5 f_14 ">ERROR CODE：200002</div>
        <img src="https://maimaidx-eng.com/maimai-mobile/img/line_01.png" class="w_396" />
        <div class="p_5 f_12 gray break">The connection time has been expired.<br>Please try again later.</div>
      </div>`;

    expect(describeSegaError(html)).toEqual({ code: "200002", message: "The connection time has been expired. Please try again later." });
  });

  it("returns nothing for a page that isn't an error page", () => {
    expect(describeSegaError("<div class=\"see_through_block\">profile</div>")).toEqual({});
  });
});
