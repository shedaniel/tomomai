import { afterEach, describe, expect, it, vi } from "vitest";
import { collectTakeoutExport } from "./tomomai-api";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    statusText: init?.statusText,
    headers: { "Content-Type": "application/json" },
  });
}

function requestPath(resource: URL | RequestInfo): string {
  const url = new URL(String(resource));
  return `${url.pathname}${url.search}`;
}

describe("collectTakeoutExport", () => {
  it("fetches recents and albums until hasMore is false", async () => {
    const paths: string[] = [];
    globalThis.fetch = vi.fn(async (resource: URL | RequestInfo) => {
      const path = requestPath(resource);
      paths.push(path);

      if (path === "/api/v1/me") return jsonResponse({ username: "mai" });
      if (path === "/api/v1/me/settings") return jsonResponse({ publishProfile: true });
      if (path === "/api/v1/me/scopes") return jsonResponse({ scopes: ["read"] });
      if (path === "/api/v1/snapshots?region=intl") {
        return jsonResponse({ snapshots: [{ id: "snapshot-1" }] });
      }
      if (path === "/api/v1/snapshots/snapshot-1?region=intl") {
        return jsonResponse({ id: "snapshot-1", songs: [] });
      }
      if (path === "/api/v1/recents?region=intl&limit=100&offset=0") {
        return jsonResponse({ plays: [{ id: "play-1" }], hasMore: true });
      }
      if (path === "/api/v1/recents?region=intl&limit=100&offset=100") {
        return jsonResponse({ plays: [{ id: "play-2" }], hasMore: false });
      }
      if (path === "/api/v1/stats?region=intl") return jsonResponse({ stats: [] });
      if (path === "/api/v1/albums?region=intl&limit=100&offset=0") {
        return jsonResponse({ albums: [{ id: "album-1" }], hasMore: true });
      }
      if (path === "/api/v1/albums?region=intl&limit=100&offset=100") {
        return jsonResponse({ albums: [{ id: "album-2" }], hasMore: false });
      }

      return jsonResponse({ error: `unexpected ${path}` }, { status: 500 });
    }) as typeof fetch;

    const payload = await collectTakeoutExport({
      apiBase: "https://tomomai.test",
      accessToken: "token",
      regions: ["intl"],
    });

    expect(paths).toContain("/api/v1/recents?region=intl&limit=100&offset=0");
    expect(paths).toContain("/api/v1/recents?region=intl&limit=100&offset=100");
    expect(paths).toContain("/api/v1/albums?region=intl&limit=100&offset=0");
    expect(paths).toContain("/api/v1/albums?region=intl&limit=100&offset=100");
    expect(payload.regions.intl.recents).toEqual([{ id: "play-1" }, { id: "play-2" }]);
    expect(payload.regions.intl.albums).toEqual([{ id: "album-1" }, { id: "album-2" }]);
  });

  it("records region endpoint failures and continues other regions", async () => {
    globalThis.fetch = vi.fn(async (resource: URL | RequestInfo) => {
      const path = requestPath(resource);

      if (path === "/api/v1/me") return jsonResponse({ username: "mai" });
      if (path === "/api/v1/me/settings") return jsonResponse({ publishProfile: true });
      if (path === "/api/v1/me/scopes") return jsonResponse({ scopes: ["read"] });
      if (path === "/api/v1/snapshots?region=intl") {
        return jsonResponse({ error: "Region disabled" }, { status: 503 });
      }
      if (path === "/api/v1/recents?region=intl&limit=100&offset=0") {
        return jsonResponse({ plays: [], hasMore: false });
      }
      if (path === "/api/v1/stats?region=intl") return jsonResponse({ stats: [] });
      if (path === "/api/v1/albums?region=intl&limit=100&offset=0") {
        return jsonResponse({ albums: [], hasMore: false });
      }
      if (path === "/api/v1/snapshots?region=jp") return jsonResponse({ snapshots: [] });
      if (path === "/api/v1/recents?region=jp&limit=100&offset=0") {
        return jsonResponse({ plays: [{ id: "jp-play" }], hasMore: false });
      }
      if (path === "/api/v1/stats?region=jp") return jsonResponse({ totalSongs: 1 });
      if (path === "/api/v1/albums?region=jp&limit=100&offset=0") {
        return jsonResponse({ albums: [], hasMore: false });
      }

      return jsonResponse({ error: `unexpected ${path}` }, { status: 500 });
    }) as typeof fetch;

    const payload = await collectTakeoutExport({
      apiBase: "https://tomomai.test",
      accessToken: "token",
      regions: ["intl", "jp"],
    });

    expect(payload.regions.intl.errors).toContainEqual({
      endpoint: "/api/v1/snapshots?region=intl",
      status: 503,
      error: "Region disabled",
    });
    expect(payload.regions.jp.recents).toEqual([{ id: "jp-play" }]);
  });
});
