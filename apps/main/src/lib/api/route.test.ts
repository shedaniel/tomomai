import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { z } from "zod";

const mocks = vi.hoisted(() => {
  const limiter = () => ({
    check: vi.fn(async () => ({ limited: false, limit: 100, remaining: 90, retryAfter: 0 })),
    reward: vi.fn(async () => undefined),
  });
  return {
    verifyApiKey: vi.fn(),
    keyLimiter: limiter(),
    userLimiter: limiter(),
    consumeMonthly: vi.fn(async () => ({ ok: true, used: 10, limit: 1000, resetAt: new Date("2026-10-01T00:00:00Z") })),
    refundMonthly: vi.fn(async () => undefined),
    log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
    fetchUserAlbums: vi.fn(),
    fetchPlayerStats: vi.fn(),
    fetchLatestPlateSongs: vi.fn(),
    fetchRecentSongs: vi.fn(),
  };
});

vi.mock("@/lib/auth", () => ({ auth: { api: { verifyApiKey: mocks.verifyApiKey } } }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/security/redis-rate-limit", () => ({ apiKeyLimiter: mocks.keyLimiter, apiUserLimiter: mocks.userLimiter }));
vi.mock("@/lib/api/quota", () => ({ consumeMonthly: mocks.consumeMonthly, peekMonthly: vi.fn(), refundMonthly: mocks.refundMonthly }));
vi.mock("@/lib/request-logger", () => ({ requestLogger: () => ({ log: mocks.log, requestId: "route-test" }), getLogger: () => mocks.log }));
vi.mock("@/server/queries/albums", () => ({ fetchUserAlbums: mocks.fetchUserAlbums }));
vi.mock("@/server/queries/stats", () => ({ fetchPlayerStats: mocks.fetchPlayerStats }));
vi.mock("@/server/services/games/maimai/plates", () => ({ fetchLatestPlateSongs: mocks.fetchLatestPlateSongs }));
vi.mock("@/server/queries/recents", () => ({ fetchRecentSongs: mocks.fetchRecentSongs }));

import { GameError } from "@/lib/games/errors";
import { GET as getAlbums } from "@/app/api/v1/games/[game]/albums/route";
import { GET as getPlates } from "@/app/api/v1/games/[game]/plates/route";
import { GET as getRecents } from "@/app/api/v1/games/[game]/recents/route";
import { GET as getStats } from "@/app/api/v1/games/[game]/stats/route";
import { defineGameHandler } from "./protect";
import { defineGameRoute, defineRoute } from "./registry";
import { definePublicGameHandler } from "./route";
import { querySchemas } from "./schemas";

const KEY = "tmk_valid";

function request(path: string, { key }: { key?: string } = {}) {
  return new NextRequest(`https://example.test/api/v1/games/${path}`, { headers: key ? { "x-api-key": key } : {} });
}

function context(params: Record<string, string>) {
  return { params: Promise.resolve(params) };
}

const keyedSpec = defineGameRoute({
  method: "GET",
  path: "/api/v1/games/{game}/route-test/{id}",
  tag: "Test",
  summary: "Keyed route test",
  scope: "recent:read",
  capability: "recents",
  cost: 3,
  params: z.object({ id: z.coerce.number().int() }),
  query: querySchemas.regionRequired,
  response: z.object({ id: z.number(), region: z.string() }),
});

const publicSpec = defineGameRoute({
  method: "GET",
  path: "/api/v1/games/{game}/route-test",
  tag: "Test",
  summary: "Public route test",
  scope: "public",
  capability: "catalog",
  cost: 1,
  cacheSeconds: 60,
  response: z.object({ ok: z.literal(true) }),
});

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_ENABLED_MAIMAI_REGIONS", "intl,jp");
  vi.stubEnv("NEXT_PUBLIC_ENABLED_CHUNITHM_REGIONS", "intl,jp");
  mocks.verifyApiKey.mockImplementation(async ({ body }: { body: { key: string } }) => body.key === KEY
    ? { valid: true, key: { referenceId: "user-1", id: "key-1", permissions: { "album:read": ["access"], "plate:read": ["access"], "stats:read": ["access"], "recent:read": ["access"] }, name: null, expiresAt: null } }
    : { valid: false, error: { message: "Invalid API key" } });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("keyed game routes", () => {
  it("answers an anonymous request with 401 before checking the game", async () => {
    for (const path of ["chunithm/albums?region=jp", "unknown/albums"]) {
      const response = await getAlbums(request(path), context({ game: path.split("/")[0] }));
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "Missing API key" });
    }
    expect(mocks.verifyApiKey).not.toHaveBeenCalled();
    expect(mocks.fetchUserAlbums).not.toHaveBeenCalled();
  });

  it("rejects a game without the route's capability once the key is checked and metered", async () => {
    const albums = await getAlbums(request("chunithm/albums?region=jp", { key: KEY }), context({ game: "chunithm" }));
    expect(albums.status).toBe(422);
    expect((await albums.json()).code).toBe("UNSUPPORTED_CAPABILITY");
    expect(albums.headers.get("X-RateLimit-Cost")).toBe("2");

    const plates = await getPlates(request("chunithm/plates?region=jp&version=24000&difficulty=master&plateType=shou", { key: KEY }), context({ game: "chunithm" }));
    expect(plates.status).toBe(422);
    expect((await plates.json()).code).toBe("UNSUPPORTED_CAPABILITY");

    expect(mocks.fetchUserAlbums).not.toHaveBeenCalled();
    expect(mocks.fetchLatestPlateSongs).not.toHaveBeenCalled();
  });

  it("serves player stats only for games with the stats capability", async () => {
    mocks.fetchPlayerStats.mockResolvedValue({ stats: {}, totalSongs: {} });

    const chunithm = await getStats(request("chunithm/stats?region=jp", { key: KEY }), context({ game: "chunithm" }));
    expect(chunithm.status).toBe(422);
    expect((await chunithm.json()).code).toBe("UNSUPPORTED_CAPABILITY");

    const maimai = await getStats(request("maimai/stats?region=jp", { key: KEY }), context({ game: "maimai" }));
    expect(maimai.status).toBe(200);
    expect(await maimai.json()).toEqual({ game: "maimai", stats: {}, totalSongs: {} });
    expect(mocks.fetchPlayerStats).toHaveBeenCalledOnce();
    expect(mocks.fetchPlayerStats).toHaveBeenCalledWith("maimai", "user-1", "jp");
  });

  it("publishes a recent play's details and withholds its playlog without the detailed scope", async () => {
    const playlog = { maxCombo: 10, judgments: { justiceCritical: 10, justice: 0, attack: 0, miss: 0 }, notePercentages: { tap: 101, hold: 101, slide: 101, air: 101, flick: 101 } };
    mocks.fetchRecentSongs.mockResolvedValue({ totalCount: 1, hasMore: false, recentPlays: [{
      recentSongId: BigInt(1), playedAt: new Date("2026-09-01T00:00:00Z"), scoreValue: 1010000, secondaryScore: 0, comboStatus: 3, syncStatus: 0, clearStatus: 0, track: 1,
      songId: "Ab3xK9pQ:j23", songName: "Song", artist: "Artist", cover: null, difficultyCode: 3, typeCode: 0, level: "14", levelPrecise: 140, genre: "Genre",
      details: { game: "chunithm", playlog },
    }] });
    const plays = async () => (await (await getRecents(request("chunithm/recents?region=jp", { key: KEY }), context({ game: "chunithm" }))).json()).plays;

    expect((await plays())[0].details).toEqual({ game: "chunithm", playlog: null });

    mocks.verifyApiKey.mockResolvedValueOnce({ valid: true, key: { referenceId: "user-1", id: "key-1", permissions: { "recent:read": ["access"], "recent:detailed:read": ["access"] }, name: null, expiresAt: null } });
    expect((await plays())[0].details).toEqual({ game: "chunithm", playlog });
    expect(mocks.fetchRecentSongs).toHaveBeenCalledWith("chunithm", "user-1", "jp", 50, 0);
  });

  it("answers every rejected parameter with an error and a code", async () => {
    const handler = vi.fn();
    const GET = defineGameHandler(keyedSpec, handler);
    const cases = [
      ["maimai/route-test/1", "maimai", 400, "INVALID_PARAMETER"],
      ["maimai/route-test/1?region=xx", "maimai", 400, "INVALID_PARAMETER"],
      ["maimai/route-test/one?region=jp", "maimai", 400, "INVALID_PARAMETER"],
      ["maimai/route-test/1?region=cn", "maimai", 400, "UNSUPPORTED_REGION"],
      ["maimaidx/route-test/1?region=jp", "maimaidx", 400, "UNKNOWN_GAME"],
    ] as const;

    for (const [path, game, status, code] of cases) {
      const response = await GET(request(path, { key: KEY }), context({ game, id: path.split("/")[2].split("?")[0] }));
      expect(response.status).toBe(status);
      const body = await response.json();
      expect(Object.keys(body).sort()).toEqual(["code", "error"]);
      expect(body.code).toBe(code);
    }
    expect(await (await GET(request("maimai/route-test/1", { key: KEY }), context({ game: "maimai", id: "1" }))).json())
      .toEqual({ error: expect.stringMatching(/^Invalid \?region: /), code: "INVALID_PARAMETER" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("hands the handler the parsed request and adds the game to its body", async () => {
    const GET = defineGameHandler(keyedSpec, async ({ game, key, params, query }) => ({ id: params.id, region: `${game}:${query.region}:${key.userId}` }));

    const response = await GET(request("chunithm/route-test/7?region=intl", { key: KEY }), context({ game: "chunithm", id: "7" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ game: "chunithm", id: 7, region: "chunithm:intl:user-1" });
    expect(mocks.keyLimiter.check).toHaveBeenCalledWith("key-1", 3);
    expect(response.headers.get("X-RateLimit-Cost")).toBe("3");
    expect(response.headers.get("Cache-Control")).toBeNull();
  });

  it("answers 500 and logs each issue when the handler's body breaks the response schema", async () => {
    const GET = defineGameHandler(keyedSpec, async ({ params }) => ({ id: params.id, region: 7 as unknown as string }));

    const response = await GET(request("maimai/route-test/1?region=jp", { key: KEY }), context({ game: "maimai", id: "1" }));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Internal server error" });
    expect(mocks.log.error).toHaveBeenCalledWith({ issues: ["region: Invalid input: expected string, received number"] }, "Response does not match its schema");
  });

  it("maps a game rejection thrown by the handler", async () => {
    const GET = defineGameHandler(keyedSpec, async ({ game }) => {
      throw new GameError("UNSUPPORTED_CAPABILITY", "Not here", game);
    });

    const response = await GET(request("maimai/route-test/1?region=jp", { key: KEY }), context({ game: "maimai", id: "1" }));

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "Not here", code: "UNSUPPORTED_CAPABILITY" });
  });

  it("refunds and logs a handler failure as a 500", async () => {
    const failure = new Error("database down");
    const GET = defineGameHandler(keyedSpec, async () => {
      throw failure;
    });

    const response = await GET(request("maimai/route-test/1?region=jp", { key: KEY }), context({ game: "maimai", id: "1" }));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Internal server error" });
    expect(mocks.keyLimiter.reward).toHaveBeenCalledWith("key-1", 3);
    expect(mocks.userLimiter.reward).toHaveBeenCalledWith("user-1", 3);
    expect(mocks.refundMonthly).toHaveBeenCalledWith("user-1", 3);
    expect(mocks.log.error).toHaveBeenCalledWith({ err: failure }, "API handler error");
  });
});

describe("public game routes", () => {
  it("answers an unknown game with 400 UNKNOWN_GAME", async () => {
    const GET = definePublicGameHandler(publicSpec, async () => ({ ok: true }) as const);

    const response = await GET(request("unknown/route-test"), context({ game: "unknown" }));

    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("UNKNOWN_GAME");
  });

  it("caches only the successful answers of a route with cacheSeconds", async () => {
    let found = true;
    const GET = definePublicGameHandler(publicSpec, async () => found ? { ok: true } as const : Response.json({ error: "Missing" }, { status: 404 }));

    const ok = await GET(request("maimai/route-test"), context({ game: "maimai" }));
    expect(await ok.json()).toEqual({ game: "maimai", ok: true });
    expect(ok.headers.get("Cache-Control")).toBe("public, max-age=60, stale-while-revalidate=86400");

    found = false;
    const missing = await GET(request("maimai/route-test"), context({ game: "maimai" }));
    expect(missing.status).toBe(404);
    expect(missing.headers.get("Cache-Control")).toBeNull();
  });

  it("keeps public and keyed specs on their own factories", () => {
    // @ts-expect-error A public route has no key to authenticate.
    const keyedPublic = () => defineGameHandler(publicSpec, async () => ({ ok: true }) as const);
    // @ts-expect-error A keyed route must authenticate its key.
    const publicKeyed = () => definePublicGameHandler(keyedSpec, async () => ({ id: 1, region: "jp" }));
    expect([keyedPublic, publicKeyed]).toHaveLength(2);
  });

  it("refuses public caching on a keyed route", () => {
    expect(() => defineRoute({ method: "GET", path: "/api/v1/cached-test", tag: "Test", summary: "Test", scope: "ready", cost: 1, cacheSeconds: 60, response: z.object({}) }))
      .toThrow("cannot be publicly cached");
  });
});
