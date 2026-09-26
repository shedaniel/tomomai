import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ rows: [] as unknown[][], queries: [] as { sql: string; params: unknown[] }[] }));
vi.mock("@/lib/db", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  return { db: drizzle(async (sql, params) => {
    state.queries.push({ sql, params });
    return { rows: state.rows };
  }) };
});
vi.mock("next/cache", () => ({ unstable_cache: (fn: () => unknown) => fn }));
vi.mock("@/lib/song-slug", () => ({ getSongSlugs: async (songs: object[]) => songs.map(song => ({ ...song, slug: "same-title-artist", aliases: [] })) }));
import { queryAllUniqueSongs } from "./songs";

beforeEach(() => { state.rows = []; state.queries = []; });

function chart(overrides: Partial<{ id: number; parentId: string; disambiguator: number; level: string; levelPrecise: number; gameVersion: number; metadata: object }> = {}) {
  const row = { id: 1, parentId: "abcdefgh", disambiguator: 0, level: "13", levelPrecise: 130, gameVersion: 1, metadata: {}, ...overrides };
  return [String(row.id), row.parentId, row.disambiguator, "Same title", "Artist", "", 0, "Original", 4,
    row.level, row.levelPrecise, row.metadata, null, 1, "jp", row.gameVersion];
}

describe("common catalog view", () => {
  it.each([{ game: "maimai", type: "std", difficulty: "remaster" }, { game: "chunithm", type: "standard", difficulty: "ultima" }] as const)("decodes $game chart codes and groups the newest constant", async ({ game, type, difficulty }) => {
    state.rows = [chart(), chart({ id: 2, gameVersion: 2, levelPrecise: 140 })];
    const [song] = await queryAllUniqueSongs(game);
    expect(song.parentIds).toEqual(["abcdefgh"]);
    expect(song.type).toBe(type);
    expect(song.difficulties).toEqual([expect.objectContaining({ difficulty, levelPrecise: 140 })]);
    expect(state.queries[0].sql).toContain('"songs"."game" = $1');
    expect(state.queries[0].params).toEqual([game]);
  });

  it("keeps disambiguated parents separate while preserving the original slug", async () => {
    state.rows = [chart(), chart({ id: 2, parentId: "ijklmnop", disambiguator: 1 })];
    const result = await queryAllUniqueSongs("maimai");
    expect(result.map(song => [song.slug, song.parentIds])).toEqual([
      ["same-title-artist", ["abcdefgh"]],
      ["same-title-artist-1", ["ijklmnop"]],
    ]);
  });

  it("preserves display levels and fallback provenance", async () => {
    state.rows = [chart({ level: "14+", levelPrecise: 145, metadata: { levelPreciseEstimated: true } })];
    const [song] = await queryAllUniqueSongs("chunithm");
    expect(song.difficulties[0]).toMatchObject({ level: "14+", levelPrecise: 145, levelPreciseEstimated: true });
  });
});
