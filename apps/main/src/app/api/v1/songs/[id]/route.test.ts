import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { PgDialect } from "drizzle-orm/pg-core";
const { query, where } = vi.hoisted(() => ({ query: vi.fn(), where: vi.fn() }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/db", () => ({ db: { select: () => ({ from: () => ({ innerJoin: () => ({
  where: (filter: unknown) => { where(filter); return { orderBy: () => ({ limit: query }) }; },
}) }) }) } }));
import { GET } from "./route";

const row = {
  songId: "Ab3xK9pQ", songName: "Test", artist: "Artist", cover: null,
  type: "dx", genre: "maimai", difficulty: "master", bpm: 180,
  level: "13", levelPrecise: 133, region: "jp", gameVersion: 11, addedVersion: 10, noteDesigner: null,
  tapCount: 100, holdCount: 5, slideCount: 10, touchCount: 0, breakCount: 4,
};
function get(id: string) {
  return GET(new NextRequest("https://example.test/api/v1/songs/" + id), { params: Promise.resolve({ id }) });
}
beforeEach(() => { query.mockReset(); where.mockReset(); });

describe("song details", () => {
  it("rejects malformed IDs before querying", async () => {
    expect((await get("bad:j11")).status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });
  it("looks up a parent and returns the selected instance ID with cache headers", async () => {
    query.mockResolvedValue([row]);
    const response = await get("Ab3xK9pQ");
    expect(response.status).toBe(200);
    expect((await response.json()).songId).toBe("Ab3xK9pQ:j11");
    expect(response.headers.get("Cache-Control")).toContain("max-age=3600");
    expect(new PgDialect().sqlToQuery(where.mock.calls[0][0]).params).toEqual(["Ab3xK9pQ"]);
    expect(query).toHaveBeenCalledWith(1);
  });
  it("uses region and version predicates for exact instance IDs", async () => {
    query.mockResolvedValue([]);
    expect((await get("Ab3xK9pQ:i-1")).status).toBe(404);
    expect(new PgDialect().sqlToQuery(where.mock.calls[0][0]).params).toEqual(["Ab3xK9pQ", "intl", -1]);
  });
});
