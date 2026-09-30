import { beforeEach, expect, it, vi } from "vitest";

const proxy = await vi.hoisted(async () => (await import("@/test/pg-proxy")).createProxyDb());
vi.mock("@/lib/db", () => ({ db: proxy.db }));

import { fetchRecentSongs } from "./recents";

const playlog = { maxCombo: 1425, judgments: { justiceCritical: 1400, justice: 20, attack: 5, miss: 0 }, notePercentages: { tap: 101, hold: 101, slide: 100.5, air: 101, flick: 100 } };

function storedPlay(recentSongId: string, metadata: unknown) {
  return {
    recentSongId, playedAt: "2026-09-01 00:00:00", scoreValue: 1009000, secondaryScore: 0, comboStatus: 2, syncStatus: 0, clearStatus: 1,
    maxSecondaryScore: null, metadata, track: 2, songId: "Ab3xK9pQ:j23", songName: "Song", artist: "Artist", cover: null,
    difficultyCode: 3, typeCode: 0, level: "14", levelPrecise: 140, genre: "Genre",
  };
}

beforeEach(() => proxy.reset());

it("gives every play its game's details in order and keeps the stored columns off the payload", async () => {
  proxy.respond([storedPlay("1", JSON.stringify(playlog)), storedPlay("2", null)], [{ totalCount: 2 }]);

  const { recentPlays, totalCount, hasMore } = await fetchRecentSongs("chunithm", "user", "jp", 20, 0);

  expect(totalCount).toBe(2);
  expect(hasMore).toBe(false);
  expect(recentPlays.map(play => play.details)).toEqual([{ game: "chunithm", playlog }, { game: "chunithm", playlog: null }]);
  expect(recentPlays[0]).not.toHaveProperty("metadata");
  expect(recentPlays[0]).not.toHaveProperty("maxSecondaryScore");
  expect(recentPlays[0]).toMatchObject({ recentSongId: BigInt(1), track: 2, songId: "Ab3xK9pQ:j23", scoreValue: 1009000 });
});
