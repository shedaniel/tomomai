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
  it.each([{ scores: [] }, { scores: [{ artist: "A", region: "jp", difficulty: "master", achievement: 100, fc: "none", fs: "none" }] }])(
    "rejects an ambiguous catalog name regardless of the user's scores (%j)", async ({ scores }) => {
      readArtists.mockResolvedValue([{ artist: "A" }, { artist: "B" }]);
      readScores.mockResolvedValue(scores);
      await expect(querySongScores("Link", "std", "user")).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(select).not.toHaveBeenCalled();
    },
  );

  it("returns no scores for an unambiguous unplayed chart", async () => {
    await expect(querySongScores("Song", "std", "user")).resolves.toBeUndefined();
  });

  it("accepts an explicit artist and preserves the score map", async () => {
    readScores.mockResolvedValue([{ artist: "A", region: "jp", difficulty: "master", achievement: 100, fc: "none", fs: "none" }]);
    await expect(querySongScores("Link", "std", "user", "A")).resolves.toEqual({
      jp: { master: { achievement: 100, fc: "none", fs: "none" } },
    });
    expect(readArtists).not.toHaveBeenCalled();
  });
});
