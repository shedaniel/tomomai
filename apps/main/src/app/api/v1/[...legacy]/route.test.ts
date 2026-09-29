import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { DELETE, GET, PATCH, POST, PUT } from "./route";

const HANDLERS = { GET, POST, PUT, PATCH, DELETE };

function call(method: keyof typeof HANDLERS, path: string) {
  const url = new URL(path, "https://example.test");
  const legacy = url.pathname.replace(/^\/api\/v1\//, "").split("/");
  return HANDLERS[method](new NextRequest(url, { method }), { params: Promise.resolve({ legacy }) });
}

describe("paths from before the game namespace", () => {
  it.each([
    ["GET", "/api/v1/recents?region=jp&limit=10", "/api/v1/games/maimai/recents?region=jp&limit=10"],
    ["GET", "/api/v1/songs/versions?region=intl", "/api/v1/games/maimai/songs/versions?region=intl"],
    ["GET", "/api/v1/snapshots/latest?region=jp", "/api/v1/games/maimai/snapshots/latest?region=jp"],
    ["DELETE", "/api/v1/snapshots/AbCd_123?region=jp", "/api/v1/games/maimai/snapshots/AbCd_123?region=jp"],
    ["POST", "/api/v1/fetch?region=intl", "/api/v1/games/maimai/fetch?region=intl"],
    ["GET", "/api/v1/parents", "/api/v1/games/maimai/parents"],
  ] as const)("answer %s %s with 410 and the maimai location", async (method, path, location) => {
    const response = await call(method, path);
    expect(response.status).toBe(410);
    expect(await response.json()).toStrictEqual({ error: `This endpoint moved to ${location}`, code: "MOVED", location });
  });

  it.each(["/api/v1/nothing", "/api/v1/games/maimai/nothing", "/api/v1/me/nothing"])("answer %s, which never existed, with 404", async path => {
    const response = await call("GET", path);
    expect(response.status).toBe(404);
    expect(await response.json()).toStrictEqual({ error: "Not found" });
  });
});
