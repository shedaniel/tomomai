import { createServer, type Server } from "http";
import type { AddressInfo, Socket } from "net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinnedAgent } from "../http-agent";
import { bindSessionAgent, maimaiGetHtml, maimaiImageRequest, maimaiRequest, releaseSession } from "./http";

vi.mock("../logger", () => ({ logger: { warn: vi.fn(), debug: vi.fn(), info: vi.fn() } }));

// Each TCP connection is served by the next backend in `backends`; a "bad"
// backend doesn't know the session, like maimai DX NET's.
let server: Server;
let base: string;
let backends: ("good" | "bad")[];
let openSockets: Set<Socket>;
let connectionCount: number;
let pageRequests: number;

beforeEach(async () => {
  backends = [];
  openSockets = new Set();
  connectionCount = 0;
  pageRequests = 0;
  server = createServer((req, res) => {
    const backend = (req.socket as Socket & { backend: string }).backend;
    if (req.url !== "/maimai-mobile/error/") pageRequests++;
    if (req.url === "/maimai-mobile/error/") {
      res.writeHead(200).end("ERROR CODE：100001");
    } else if (backend === "bad") {
      if (req.url!.startsWith("/maimai-mobile/img/")) res.writeHead(404).end("not found");
      else res.writeHead(302, { Location: "/maimai-mobile/error/" }).end();
    } else {
      res.writeHead(200).end(`ok ${req.url}`);
    }
  });
  server.on("connection", (socket: Socket & { backend: string }) => {
    socket.backend = backends[connectionCount++] ?? "good";
    openSockets.add(socket);
    socket.on("close", () => openSockets.delete(socket));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  releaseSession("session=1");
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

describe("maimai session pinning", () => {
  it("keeps every request of a session on one connection", async () => {
    bindSessionAgent("session=1", createPinnedAgent());

    const pages = await Promise.all(
      Array.from({ length: 8 }, (_, i) => maimaiGetHtml(`${base}/maimai-mobile/page${i}/`, "session=1", base)),
    );

    expect(pages).toEqual(Array.from({ length: 8 }, (_, i) => `ok /maimai-mobile/page${i}/`));
    expect(connectionCount).toBe(1);
  });

  it("moves to a new connection when a backend rejects the session, then stays there", async () => {
    backends = ["bad", "bad", "good"];
    bindSessionAgent("session=1", createPinnedAgent());

    expect(await maimaiGetHtml(`${base}/maimai-mobile/playerData/`, "session=1", base)).toBe("ok /maimai-mobile/playerData/");
    expect(await maimaiGetHtml(`${base}/maimai-mobile/record/`, "session=1", base)).toBe("ok /maimai-mobile/record/");
    expect(connectionCount).toBe(3);

    await settle();
    expect(openSockets.size).toBe(1);
  });

  it("gives up after the attempt limit and returns the rejection", async () => {
    backends = ["bad", "bad", "bad", "bad", "good"];
    bindSessionAgent("session=1", createPinnedAgent());

    const response = await maimaiRequest(`${base}/maimai-mobile/playerData/`, "session=1", base);

    expect(new URL(response.url).pathname).toBe("/maimai-mobile/error/");
    expect(await response.text()).toContain("100001");
    expect(connectionCount).toBe(4);
  });

  it("closes the session's connection on release", async () => {
    bindSessionAgent("session=1", createPinnedAgent());
    await maimaiGetHtml(`${base}/maimai-mobile/home/`, "session=1", base);
    expect(openSockets.size).toBe(1);

    releaseSession("session=1");
    await settle();

    expect(openSockets.size).toBe(0);
  });

  it("doesn't retry pages without a session", async () => {
    backends = ["bad"];

    const response = await maimaiRequest(`${base}/maimai-mobile/home/`, "other=1", base);

    expect(new URL(response.url).pathname).toBe("/maimai-mobile/error/");
    expect(pageRequests).toBe(1);
  });
});

describe("maimai image requests", () => {
  it("retries a 404 without a session and closes the throwaway connections", async () => {
    backends = ["bad", "bad", "good"];

    const response = await maimaiImageRequest(`${base}/maimai-mobile/img/Icon/a.png`, "");

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok /maimai-mobile/img/Icon/a.png");
    await settle();
    // Only the shared agent's keep-alive connection (the first attempt) may stay open.
    expect(openSockets.size).toBeLessThanOrEqual(1);
  });

  it("uses the session's connection when there is one", async () => {
    bindSessionAgent("session=1", createPinnedAgent());
    await maimaiGetHtml(`${base}/maimai-mobile/home/`, "session=1", base);

    const response = await maimaiImageRequest(`${base}/maimai-mobile/img/Icon/a.png`, "session=1");

    expect(response.status).toBe(200);
    await response.arrayBuffer();
    expect(connectionCount).toBe(1);
  });
});
