import { beforeEach, describe, expect, it, vi } from "vitest";
import { codeOf } from "@/lib/games/codes";
import type { ProxyRow } from "@/test/pg-proxy";

const proxy = await vi.hoisted(async () => (await import("@/test/pg-proxy")).createProxyDb());
vi.mock("@/lib/db", () => ({ db: proxy.db }));
vi.mock("@/lib/song-slug", () => ({ getSongSlugs: vi.fn() }));
import { querySongScores } from "./songs";

const played = (overrides: ProxyRow = {}) => ({
  region: "jp", artist: "A", difficulty: codeOf("maimai", "difficulty", "master"), scoreValue: 1005000, comboStatus: 0, syncStatus: 0, clearStatus: 0, ...overrides,
});

// The catalog's artists for a title come from parent_song, the viewer's scores from their snapshots.
function store({ artists, scores }: { artists: string[]; scores: ProxyRow[] }) {
  proxy.answer(({ table }) => {
    if (table === "parent_song") return artists.map(artist => ({ artist }));
    if (table === "snapshot_scores") return scores;
  });
}

beforeEach(() => proxy.reset());

describe("querySongScores", () => {
  it.each([{ scores: [] }, { scores: [played()] }])("rejects an ambiguous catalog name regardless of the user's scores (%j)", async ({ scores }) => {
    store({ artists: ["A", "B"], scores });
    await expect(querySongScores({ game: "maimai", songName: "Link", type: "std", userId: "user" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(proxy.queries.map(query => query.table)).toEqual(["parent_song"]);
  });

  it("returns no scores for an unambiguous unplayed chart", async () => {
    store({ artists: ["A"], scores: [] });
    await expect(querySongScores({ game: "maimai", songName: "Song", type: "std", userId: "user" })).resolves.toBeUndefined();
  });

  it("accepts an explicit artist without the ambiguity check and maps scores by region and difficulty", async () => {
    store({ artists: ["A", "B"], scores: [played(), played({ region: "intl", scoreValue: 1000000, comboStatus: 1 })] });
    await expect(querySongScores({ game: "maimai", songName: "Link", type: "std", userId: "user", artist: "A" })).resolves.toEqual({
      jp: { master: { scoreValue: 1005000, comboStatus: 0, syncStatus: 0, clearStatus: 0 } },
      intl: { master: { scoreValue: 1000000, comboStatus: 1, syncStatus: 0, clearStatus: 0 } },
    });
    expect(proxy.queries.map(query => query.table)).toEqual(["snapshot_scores"]);
  });
});

it.each([
  { game: "maimai", difficulty: "remaster", type: "std", other: "chunithm" },
  { game: "chunithm", difficulty: "ultima", type: "standard", other: "maimai" },
] as const)("reads only the viewer's $game scores", async ({ game, difficulty, type, other }) => {
  // Scores answer only a query that names the viewer and the game, as its snapshot and catalog predicates do.
  proxy.answer(({ table, params }) => table === "snapshot_scores" && params.includes("viewer") && params.includes(game)
    ? [played({ difficulty: codeOf(game, "difficulty", difficulty), scoreValue: 1009000, comboStatus: 2, syncStatus: 1, clearStatus: 2 })]
    : []);
  const query = { songName: "Same title", type, artist: "A" };
  await expect(querySongScores({ game, ...query, userId: "viewer" })).resolves.toEqual({
    jp: { [difficulty]: { scoreValue: 1009000, comboStatus: 2, syncStatus: 1, clearStatus: 2 } },
  });
  await expect(querySongScores({ game, ...query, userId: "stranger" })).resolves.toBeUndefined();
  await expect(querySongScores({ game: other, ...query, type: other === "maimai" ? "std" : "standard", userId: "viewer" })).resolves.toBeUndefined();
});

it("reads scores only of the resolved parent identities", async () => {
  proxy.answer(({ table, params }) => table === "snapshot_scores" && params.includes("abcdefgh") ? [played()] : []);
  const song = { game: "maimai", songName: "Same title", type: "std", userId: "viewer", artist: "A" } as const;
  await expect(querySongScores({ ...song, parentIds: ["abcdefgh"] })).resolves.toHaveProperty("jp.master");
  await expect(querySongScores({ ...song, parentIds: ["ijklmnop"] })).resolves.toBeUndefined();
});
