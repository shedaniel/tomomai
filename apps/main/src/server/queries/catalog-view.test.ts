import { beforeEach, describe, expect, it, vi } from "vitest";

const proxy = await vi.hoisted(async () => (await import("@/test/pg-proxy")).createProxyDb());
const { cache } = vi.hoisted(() => ({ cache: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: proxy.db }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: () => unknown, key: unknown, options: unknown) => { cache(key, options); return fn; } }));
vi.mock("@/lib/song-slug", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/song-slug")>(),
  getSongSlugs: async (songs: object[]) => songs.map(song => ({ ...song, slug: "same-title-artist", aliases: [] })),
}));
import { catalogTags } from "@/lib/cache-tags";
import { queryAllUniqueSongs } from "./songs";

beforeEach(() => { proxy.reset(); cache.mockReset(); });

function chart(overrides: Record<string, unknown> = {}) {
  return {
    id: "1", parentId: "abcdefgh", disambiguator: 0, songName: "Same title", artist: "Artist", cover: "", type: 0, genre: "Original",
    difficultyCode: 4, level: "13", levelPrecise: 130, metadata: {}, noteDesigner: null, addedVersion: 1, region: "jp", gameVersion: 1,
    ...overrides,
  };
}

describe("common catalog view", () => {
  it.each([{ game: "maimai", type: "std", difficulty: "remaster" }, { game: "chunithm", type: "standard", difficulty: "ultima" }] as const)("decodes $game chart codes and groups the newest constant", async ({ game, type, difficulty }) => {
    proxy.respond([chart(), chart({ id: "2", gameVersion: 2, levelPrecise: 140 })]);
    const [song] = await queryAllUniqueSongs(game);
    expect(song.parentIds).toEqual(["abcdefgh"]);
    expect(song.type).toBe(type);
    expect(song.difficulties).toEqual([expect.objectContaining({ difficulty, levelPrecise: 140 })]);
  });

  it("lists only the requested game's charts, cached under that game's key and catalog tag", async () => {
    proxy.answer(({ params }) => params.includes("chunithm") ? [chart()] : []);
    await expect(queryAllUniqueSongs("chunithm")).resolves.toHaveLength(1);
    await expect(queryAllUniqueSongs("maimai")).resolves.toEqual([]);
    expect(cache.mock.calls).toEqual((["chunithm", "maimai"] as const).map(game => [
      expect.arrayContaining([game]), expect.objectContaining({ tags: [catalogTags(game).uniqueSongs] }),
    ]));
  });

  it("keeps disambiguated parents separate while preserving the original slug", async () => {
    proxy.respond([chart(), chart({ id: "2", parentId: "ijklmnop", disambiguator: 1 })]);
    const result = await queryAllUniqueSongs("maimai");
    expect(result.map(song => [song.slug, song.parentIds])).toEqual([
      ["same-title-artist", ["abcdefgh"]],
      ["same-title-artist-1", ["ijklmnop"]],
    ]);
  });

  it("preserves display levels and fallback provenance", async () => {
    proxy.respond([chart({ level: "14+", levelPrecise: 145, metadata: { levelPreciseEstimated: true } })]);
    const [song] = await queryAllUniqueSongs("chunithm");
    expect(song.difficulties[0]).toMatchObject({ level: "14+", levelPrecise: 145, levelPreciseEstimated: true });
  });
});
