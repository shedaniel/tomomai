import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ responses: [] as unknown[][][] }));
vi.mock("@/lib/db", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  return { db: drizzle(async () => ({ rows: state.responses.shift() ?? [] })) };
});

import { fetchRecentSongs } from "./recents";

const playlog = { maxCombo: 1425, judgments: { justiceCritical: 1400, justice: 20, attack: 5, miss: 0 }, notePercentages: { tap: 101, hold: 101, slide: 100.5, air: 101, flick: 100 } };

function storedPlay(id: string, metadata: unknown) {
  // recentSongId, playedAt, scoreValue, secondaryScore, comboStatus, syncStatus, clearStatus, maxSecondaryScore, metadata, track,
  // songId, songName, artist, cover, difficultyCode, typeCode, level, levelPrecise, genre
  return [id, "2026-09-01 00:00:00", 1009000, 0, 2, 0, 1, null, metadata, null, `Ab3xK9pQ:j23`, "Song", "Artist", null, 3, 0, "14", 140, "Genre"];
}

beforeEach(() => { state.responses = []; });

it("gives every play its game's details in order and keeps the stored columns off the payload", async () => {
  state.responses.push([storedPlay("1", JSON.stringify(playlog)), storedPlay("2", null)], [[2]]);

  const { recentPlays, totalCount, hasMore } = await fetchRecentSongs("chunithm", "user", "jp", 20, 0);

  expect(totalCount).toBe(2);
  expect(hasMore).toBe(false);
  expect(recentPlays.map(play => play.details)).toEqual([{ game: "chunithm", playlog }, { game: "chunithm", playlog: null }]);
  expect(recentPlays[0]).not.toHaveProperty("metadata");
  expect(recentPlays[0]).not.toHaveProperty("maxSecondaryScore");
  expect(recentPlays[0]).toMatchObject({ recentSongId: BigInt(1), track: 0, songId: "Ab3xK9pQ:j23", scoreValue: 1009000 });
});
