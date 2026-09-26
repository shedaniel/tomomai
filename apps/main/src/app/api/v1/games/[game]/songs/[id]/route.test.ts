import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { PgDialect } from "drizzle-orm/pg-core";
import type { CanonicalGameId } from "@/lib/games/types";
const { query, where, cache } = vi.hoisted(() => ({ query: vi.fn(), where: vi.fn(), cache: vi.fn() }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown, key: unknown, options: unknown) => { cache(key, options); return fn; } }));
vi.mock("@/lib/db", () => ({ db: { select: () => ({ from: () => ({ innerJoin: () => ({
  where: (filter: unknown) => { where(filter); return { orderBy: () => ({ limit: query }) }; },
}) }) }) } }));
import { GET } from "./route";

const row = {
  songId: "Ab3xK9pQ", songName: "Test", artist: "Artist", cover: null,
  type: 1, genre: "maimai", difficulty: 3, bpm: 180,
  level: "13", levelPrecise: 133, region: "jp", gameVersion: 11, addedVersion: 10, noteDesigner: null,
  tapCount: 100, holdCount: 5, slideCount: 10, touchCount: 0, breakCount: 4,
};
function get(id: string, game: CanonicalGameId = "maimai") {
  return GET(new NextRequest(`https://example.test/api/v1/games/${game}/songs/${id}`), { params: Promise.resolve({ game, id }) });
}
beforeEach(() => { query.mockReset(); where.mockReset(); cache.mockReset(); });

describe("song details", () => {
  it("rejects malformed IDs before querying", async () => {
    expect((await get("bad:j11")).status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });
  it.each([["maimai", 11, 1], ["chunithm", 9, 0]] as const)("looks up a %s parent and returns the selected instance ID with cache headers", async (game, gameVersion, type) => {
    query.mockResolvedValue([{ ...row, gameVersion, addedVersion: gameVersion - 1, type }]);
    const response = await get("Ab3xK9pQ", game);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ game, songId: `Ab3xK9pQ:j${gameVersion}`, type });
    expect(response.headers.get("Cache-Control")).toContain("max-age=3600");
    expect(new PgDialect().sqlToQuery(where.mock.calls[0][0]).params).toEqual([game, game, "Ab3xK9pQ"]);
    expect(query).toHaveBeenCalledWith(1);
    expect(cache).toHaveBeenCalledWith(["api-v1-parent-song-by-id", game, "Ab3xK9pQ"], expect.objectContaining({ tags: [`api-v1-songs:${game}`] }));
    const filter = new PgDialect().sqlToQuery(where.mock.calls[0][0]).sql;
    expect(filter).toContain('"songs"."game" = $1');
    expect(filter).toContain('"parent_song"."game" = $2');
  });
  it("uses region and version predicates for exact instance IDs", async () => {
    query.mockResolvedValue([]);
    expect((await get("Ab3xK9pQ:i-1")).status).toBe(404);
    expect(new PgDialect().sqlToQuery(where.mock.calls[0][0]).params).toEqual(["maimai", "maimai", "Ab3xK9pQ", "intl", -1]);
  });
});
