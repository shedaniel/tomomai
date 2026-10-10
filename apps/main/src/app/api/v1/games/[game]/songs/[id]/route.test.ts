import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { REGIONS, type CanonicalGameId } from "@/lib/games/ids";
import { catalogTags } from "@/lib/cache-tags";
import type { ProxyRow } from "@/test/pg-proxy";

const proxy = await vi.hoisted(async () => (await import("@/test/pg-proxy")).createProxyDb());
const { cache } = vi.hoisted(() => ({ cache: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: proxy.db }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown, key: unknown, options: unknown) => { cache(key, options); return fn; } }));
import { GET } from "./route";

const chart = {
  songId: "Ab3xK9pQ", songName: "Test", artist: "Artist", cover: null,
  type: 1, genre: "maimai", difficulty: 3, bpm: 180, metadata: {},
  level: "13", levelPrecise: 133, region: "jp", gameVersion: 11, addedVersion: 10, noteDesigner: null,
  tapCount: 100, holdCount: 5, slideCount: 10, touchCount: 0, breakCount: 4,
};
function get(id: string, game: CanonicalGameId = "maimai") {
  return GET(new NextRequest(`https://example.test/api/v1/games/${game}/songs/${id}`), { params: Promise.resolve({ game, id }) });
}
// Stored charts answer only a lookup that names their game and parent ID, and their region and version when it names one.
function store(game: CanonicalGameId, charts: ProxyRow[]) {
  proxy.answer(({ params }) => charts.filter(stored =>
    params.includes(game) && params.includes(stored.songId)
    && (!params.some(param => (REGIONS as readonly unknown[]).includes(param)) || (params.includes(stored.region) && params.includes(stored.gameVersion)))));
}
beforeEach(() => { proxy.reset(); cache.mockReset(); });

describe("song details", () => {
  it("rejects malformed IDs before querying", async () => {
    expect((await get("bad:j11")).status).toBe(400);
    expect(proxy.queries).toEqual([]);
  });

  it.each([["maimai", 11, 1, "chunithm"], ["chunithm", 9, 0, "maimai"]] as const)("serves a %s parent with its selected instance ID and cache headers, and nothing of another game", async (game, gameVersion, type, other) => {
    store(game, [{ ...chart, gameVersion, addedVersion: gameVersion - 1, type }]);
    const response = await get("Ab3xK9pQ", game);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ game, songId: `Ab3xK9pQ:j${gameVersion}`, type });
    expect(response.headers.get("Cache-Control")).toContain("max-age=3600");
    expect(cache).toHaveBeenCalledWith(["api-v1-parent-song-by-id", game, "Ab3xK9pQ"], expect.objectContaining({ tags: [catalogTags(game).apiSongs] }));
    expect((await get("Ab3xK9pQ", other)).status).toBe(404);
  });

  it("publishes each game's note counts as its details and only the estimates a source recorded", async () => {
    store("maimai", [{ ...chart, metadata: { levelPreciseEstimated: true } }]);
    const maimai = await (await get("Ab3xK9pQ")).json();
    expect(maimai.details).toStrictEqual({ game: "maimai", noteCounts: { tap: 100, hold: 5, slide: 10, touch: 0, break: 4 } });
    expect(maimai.levelPreciseEstimated).toBe(true);
    expect(maimai).not.toHaveProperty("addedVersionEstimated");
    expect(maimai).not.toHaveProperty("metadata");

    const metadata = { source: { provider: "otoge-db", id: "2490" }, noteCounts: { tap: 625, hold: 174, air: 331 } };
    store("chunithm", [{ ...chart, type: 0, gameVersion: 9, tapCount: null, holdCount: null, slideCount: null, touchCount: null, breakCount: null, metadata }]);
    const chunithm = await (await get("Ab3xK9pQ", "chunithm")).json();
    expect(chunithm.details).toStrictEqual({ game: "chunithm", noteCounts: { tap: 625, hold: 174, slide: null, air: 331, flick: null } });
    expect(chunithm).not.toHaveProperty("levelPreciseEstimated");
    expect(chunithm).not.toHaveProperty("metadata");
  });

  it("serves a bare parent ID from its latest version, preferring jp over intl", async () => {
    store("maimai", [{ ...chart, region: "intl", gameVersion: 12 }, { ...chart, region: "jp", gameVersion: 11 }, { ...chart, region: "jp", gameVersion: 12 }, { ...chart, region: "cn", gameVersion: 12 }]);
    expect(await (await get("Ab3xK9pQ")).json()).toMatchObject({ songId: "Ab3xK9pQ:j12", region: "jp", gameVersion: 12 });
  });

  it("serves exactly the instance an instance ID names", async () => {
    store("maimai", [{ ...chart, region: "jp", gameVersion: 12 }, { ...chart, region: "intl", gameVersion: 11 }]);
    expect(await (await get("Ab3xK9pQ:i11")).json()).toMatchObject({ songId: "Ab3xK9pQ:i11", region: "intl", gameVersion: 11 });
    expect((await get("Ab3xK9pQ:i12")).status).toBe(404);
  });
});
