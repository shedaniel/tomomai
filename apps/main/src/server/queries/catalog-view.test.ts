import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const { readRows, where, getSongSlugs } = vi.hoisted(() => ({ readRows: vi.fn(), where: vi.fn(), getSongSlugs: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { select: () => ({ from: () => ({ innerJoin: () => ({ where: (filter: unknown) => { where(filter); return { orderBy: readRows }; } }) }) }) } }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: () => unknown) => fn }));
vi.mock("@/lib/song-slug", () => ({ getSongSlugs }));
import { queryAllUniqueSongs } from "./songs";

beforeEach(() => {
  vi.clearAllMocks();
  getSongSlugs.mockImplementation(async (songs: object[]) => songs.map(song => ({ ...song, slug: "same-title-artist-std", aliases: [] })));
});

const chart = { id: 1, parentId: "abcdefgh", disambiguator: 0, songName: "Same title", artist: "Artist", cover: "", type: "std", genre: "Original", difficulty: "master", level: "13", levelPrecise: 130, metadata: {}, noteDesigner: null, addedVersion: 1, region: "jp", gameVersion: 1 };

describe("common catalog view", () => {
  it.each(["maimai", "chunithm"] as const)("scopes the same grouping and slug pipeline to %s", async game => {
    readRows.mockResolvedValue([chart, { ...chart, id: 2, gameVersion: 2, levelPrecise: 140 }]);
    const result = await queryAllUniqueSongs(game);
    expect(result).toHaveLength(1);
    expect(result[0].parentIds).toEqual(["abcdefgh"]);
    expect(result[0].difficulties[0].levelPrecise).toBe(140);
    expect(result[0].slug).toBe("same-title-artist-std");
    expect(getSongSlugs.mock.calls[0][1]).toBe(game);
    expect(new PgDialect().sqlToQuery(where.mock.calls[0][0]).params).toEqual([game]);
  });

  it("keeps disambiguated parents separate while preserving the original slug", async () => {
    readRows.mockResolvedValue([chart, { ...chart, id: 2, parentId: "ijklmnop", disambiguator: 1 }]);
    const result = await queryAllUniqueSongs("maimai");
    expect(result.map(song => [song.slug, song.parentIds])).toEqual([
      ["same-title-artist-std", ["abcdefgh"]],
      ["same-title-artist-std-1", ["ijklmnop"]],
    ]);
  });

  it("preserves display levels, estimate provenance and unknown added versions", async () => {
    readRows.mockResolvedValue([{ ...chart, level: "14+", levelPrecise: 145, addedVersion: null, metadata: { levelPreciseEstimated: true } }]);
    const [song] = await queryAllUniqueSongs("chunithm");
    expect(song.addedVersion).toBeNull();
    expect(song.difficulties[0]).toMatchObject({ level: "14+", levelPrecise: 145, levelPreciseEstimated: true });
  });
});
