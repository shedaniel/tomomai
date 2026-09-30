import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { readArtists, readScores, select } = vi.hoisted(() => ({
  readArtists: vi.fn(), readScores: vi.fn(), select: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: {
  selectDistinct: () => ({ from: () => ({ innerJoin: () => ({ where: () => ({ limit: readArtists }) }) }) }),
  select,
  selectDistinctOn: () => ({ from: () => ({ where: () => ({ orderBy: vi.fn() }) }) }),
} }));
vi.mock("@/lib/song-slug", () => ({ getSongSlugs: vi.fn() }));
import { querySongScores } from "./songs";

beforeEach(() => {
  vi.clearAllMocks();
  readArtists.mockResolvedValue([{ artist: "A" }]);
  readScores.mockResolvedValue([]);
  const query = { innerJoin: () => query, where: readScores };
  select.mockReturnValue({ from: () => query });
});

describe("querySongScores", () => {
  it.each([{ scores: [] }, { scores: [{ artist: "A", region: "jp", difficulty: "master", scoreValue: 100, comboStatus: 0, syncStatus: 0, clearStatus: 0 }] }])(
    "rejects an ambiguous catalog name regardless of the user's scores (%j)", async ({ scores }) => {
      readArtists.mockResolvedValue([{ artist: "A" }, { artist: "B" }]);
      readScores.mockResolvedValue(scores);
      await expect(querySongScores({ game: "maimai", songName: "Link", type: "std", userId: "user" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(select).not.toHaveBeenCalled();
    },
  );

  it("returns no scores for an unambiguous unplayed chart", async () => {
    await expect(querySongScores({ game: "maimai", songName: "Song", type: "std", userId: "user" })).resolves.toBeUndefined();
  });

  it("accepts an explicit artist and preserves the score map", async () => {
    readScores.mockResolvedValue([{ artist: "A", region: "jp", difficulty: "master", scoreValue: 100, comboStatus: 0, syncStatus: 0, clearStatus: 0 }]);
    await expect(querySongScores({ game: "maimai", songName: "Link", type: "std", userId: "user", artist: "A" })).resolves.toEqual({
      jp: { master: { scoreValue: 100, comboStatus: 0, syncStatus: 0, clearStatus: 0 } },
    });
    expect(readArtists).not.toHaveBeenCalled();
  });
});

it.each([{ game: "maimai", difficulty: "remaster", type: "std" }, { game: "chunithm", difficulty: "ultima", type: "standard" }] as const)("scopes $game scores by game", async ({ game, difficulty, type }) => {
  readScores.mockResolvedValue([{ artist: "A", region: "jp", difficulty, scoreValue: 1009000, comboStatus: 2, syncStatus: 1, clearStatus: 2 }]);
  const result = await querySongScores({ game, songName: "Same title", type, userId: "viewer", artist: "A" });
  expect(result?.jp[difficulty]).toEqual({ scoreValue: 1009000, comboStatus: 2, syncStatus: 1, clearStatus: 2 });
  const query = new PgDialect().sqlToQuery(readScores.mock.calls[0][0]);
  expect(query.sql).toContain('"parent_song"."game" = $');
  expect(query.params).toContain(game);
  expect(query.params).not.toContain(game === "maimai" ? "chunithm" : "maimai");
});

it("restricts user scores to the resolved parent identities", async () => {
  await querySongScores({ game: "maimai", songName: "Same title", type: "std", userId: "viewer", artist: "A", parentIds: ["abcdefgh"] });
  const query = new PgDialect().sqlToQuery(readScores.mock.calls[0][0]);
  expect(query.params).toContain("abcdefgh");
});
