import { createServer, type IncomingMessage, type Server, type ServerResponse } from "http";
import type { AddressInfo, Socket } from "net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { maimaiGet, maimaiGetHtml, maimaiImageRequest, maimaiRequest, openMaimaiSession, releaseSession } from "./http";

vi.mock("../logger", () => ({ logger: { warn: vi.fn(), debug: vi.fn(), info: vi.fn() } }));

// Models maimai DX NET: each connection comes from a network, a redemption
// binds the session to the redeeming connection's network and replaces the
// previous session, and anything else is redirected to the error page.
type NetSocket = Socket & { network: string; id: number };

let server: Server;
let base: string;
let networks: string[];
let connectionCount: number;
let openSockets: Set<Socket>;
let session: { id: number; network: string } | null;
let redemptions: number;
let failRedemptions: number;
let errorCode: string;
let imageRejection: "404" | "empty";

function handle(req: IncomingMessage, res: ServerResponse) {
  const socket = req.socket as NetSocket;
  const url = req.url!;
  if (url.startsWith("/maimai-mobile/?ssid=")) {
    if (failRedemptions > 0) {
      failRedemptions--;
      res.writeHead(404).end("not found");
      return;
    }
    redemptions++;
    session = { id: redemptions, network: socket.network };
    res.writeHead(302, { Location: "/maimai-mobile/home/", "Set-Cookie": [`userId=${redemptions}; path=/`, "_t=t; path=/"] }).end();
    return;
  }
  if (url === "/maimai-mobile/error/") {
    res.writeHead(200).end(`ERROR CODE：${errorCode}`);
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
  const valid = session !== null && cookieId === session.id && socket.network === session.network;
  const reply = () => {
    if (!valid) res.writeHead(302, { Location: "/maimai-mobile/error/" }).end();
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
  session = null;
  redemptions = 0;
  failRedemptions = 0;
  errorCode = "100001";
  imageRejection = "404";
  server = createServer(handle);
  server.on("connection", (socket: NetSocket) => {
    socket.id = connectionCount;
    socket.network = networks[connectionCount++] ?? "home";
    openSockets.add(socket);
    socket.on("close", () => openSockets.delete(socket));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 50));
const open = () => openMaimaiSession("intl", `${base}/maimai-mobile/?ssid=abc`, null);
const page = (cookies: string, path: string) => maimaiGetHtml(`${base}/maimai-mobile/${path}`, cookies, base);

describe("maimai sessions", () => {
  it("spreads requests over helper connections when their network is accepted", async () => {
    const cookies = await open();

    const pages = await Promise.all(Array.from({ length: 12 }, (_, i) => page(cookies, `page${i}/`)));

    expect(pages).toEqual(Array.from({ length: 12 }, (_, i) => `ok /maimai-mobile/page${i}/`));
    expect(connectionCount).toBe(4);
    releaseSession(cookies);
  });

  it("retires helpers whose network is rejected and keeps the session on the primary", async () => {
    networks = ["home", "away", "away", "away"];
    const cookies = await open();

    for (let i = 0; i < 12; i++) expect(await page(cookies, `page${i}/`)).toBe(`ok /maimai-mobile/page${i}/`);
    for (let i = 0; i < 8; i++) await page(cookies, "record/");

    expect(connectionCount).toBe(4);
    expect(redemptions).toBe(1);
    await settle();
    expect(openSockets.size).toBe(1);
    releaseSession(cookies);
  });

  it("redeems again on a fresh connection when the session dies", async () => {
    const cookies = await open();
    await Promise.all(Array.from({ length: 4 }, () => page(cookies, "home/")));
    expect(connectionCount).toBe(4);

    session = null;
    const pages = await Promise.all(Array.from({ length: 8 }, (_, i) => page(cookies, `page${i}/`)));

    expect(pages).toEqual(Array.from({ length: 8 }, (_, i) => `ok /maimai-mobile/page${i}/`));
    expect(redemptions).toBe(2);
    releaseSession(cookies);
  });

  it("fetches a file missing on the primary's server through another connection", async () => {
    const cookies = await open();
    const original = handle;
    server.removeAllListeners("request");
    server.on("request", (req, res) => {
      if (req.url === "/maimai-mobile/img/photo/a" && (req.socket as NetSocket).id === 0) return res.writeHead(404).end("not found");
      return original(req, res);
    });

    const response = await maimaiImageRequest(`${base}/maimai-mobile/img/photo/a`, cookies);

    expect(await response.text()).toBe("img /maimai-mobile/img/photo/a");
    expect(redemptions).toBe(1);
    await settle();
    expect(openSockets.size).toBe(1);
    releaseSession(cookies);
  });

  it("retries an empty body through another connection", async () => {
    const cookies = await open();
    let served = 0;
    const original = handle;
    server.removeAllListeners("request");
    server.on("request", (req, res) => {
      if (req.url === "/maimai-mobile/img/photo/a" && served++ === 0) return res.writeHead(200).end();
      return original(req, res);
    });

    const response = await maimaiImageRequest(`${base}/maimai-mobile/img/photo/a`, cookies);

    expect(await response.text()).toBe("img /maimai-mobile/img/photo/a");
    expect(redemptions).toBe(1);
    releaseSession(cookies);
  });

  it("gives up after the redeem limit and reports the error code", async () => {
    const cookies = await open();
    errorCode = "200002";
    const original = handle;
    server.removeAllListeners("request");
    server.on("request", (req, res) => {
      if (req.url!.startsWith("/maimai-mobile/?ssid=")) return original(req, res);
      if (req.url === "/maimai-mobile/error/") return original(req, res);
      res.writeHead(302, { Location: "/maimai-mobile/error/" }).end();
    });

    await expect(page(cookies, "playerData/")).rejects.toThrow("ERROR CODE 200002");
    expect(redemptions).toBe(3);
    releaseSession(cookies);
  });

  it("maps ERROR CODE 100001 to an expired session instead of returning the error page", async () => {
    const cookies = await open();
    releaseSession(cookies);
    session = null;

    await expect(maimaiGet(`${base}/maimai-mobile/playerData/`, cookies, base)).rejects.toThrow("Session expired");
  });

  it("returns a genuine 404 without redeeming or leaking connections", async () => {
    const cookies = await open();

    const response = await maimaiRequest(`${base}/maimai-mobile/missing/`, cookies, base);

    expect(response.status).toBe(404);
    expect(redemptions).toBe(1);
    await settle();
    expect(openSockets.size).toBe(1);
    releaseSession(cookies);
  });

  it("retries a redemption that set no cookies", async () => {
    failRedemptions = 2;

    const cookies = await open();

    expect(cookies).toBe("userId=1; _t=t");
    expect(await page(cookies, "home/")).toBe("ok /maimai-mobile/home/");
    await settle();
    expect(openSockets.size).toBe(1);
    releaseSession(cookies);
  });

  it("closes every connection on release", async () => {
    const cookies = await open();
    await Promise.all(Array.from({ length: 4 }, () => page(cookies, "home/")));
    expect(openSockets.size).toBe(4);

    releaseSession(cookies);
    await settle();

    expect(openSockets.size).toBe(0);
  });

  it("stops a request that is being retried when the session is released", async () => {
    networks = ["home", "away"];
    const cookies = await open();
    await page(cookies, "home/");

    const pending = maimaiRequest(`${base}/maimai-mobile/slow/`, cookies, base);
    await new Promise((resolve) => setTimeout(resolve, 10));
    releaseSession(cookies);

    await expect(pending).rejects.toThrow();
    await settle();
    expect(openSockets.size).toBe(0);
    expect(connectionCount).toBe(2);
  });

  it("doesn't retry pages without a session", async () => {
    session = null;

    const response = await maimaiRequest(`${base}/maimai-mobile/home/`, "other=1", base);

    expect(new URL(response.url).pathname).toBe("/maimai-mobile/error/");
  });
});

describe("maimai image requests", () => {
  it("treats an empty 200 as a rejection and retries on the primary", async () => {
    networks = ["home", "away"];
    imageRejection = "empty";
    const cookies = await open();
    await page(cookies, "home/");

    const response = await maimaiImageRequest(`${base}/maimai-mobile/img/Icon/a.png`, cookies);

    expect(await response.text()).toBe("img /maimai-mobile/img/Icon/a.png");
    releaseSession(cookies);
  });

  it("retries a rejected image without a session and closes the throwaway connections", async () => {
    networks = ["away", "away", "home"];

    const response = await maimaiImageRequest(`${base}/maimai-mobile/img/Icon/a.png`, "");

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("img /maimai-mobile/img/Icon/a.png");
    await settle();
    // Only the shared agent's keep-alive connection (the first attempt) may stay open.
    expect(openSockets.size).toBeLessThanOrEqual(1);
  });
});
