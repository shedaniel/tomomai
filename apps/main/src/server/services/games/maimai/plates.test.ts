import { beforeEach, expect, it, vi } from "vitest";

const proxy = await vi.hoisted(async () => (await import("@/test/pg-proxy")).createProxyDb());
vi.mock("@/lib/db", () => ({ db: proxy.db }));

import { fetchLatestPlateSongs, fetchPlateSongs } from "./plates";

const snapshot = { id: 41, gameVersion: 13 };

const chart = (songId: string) => ({ songId, songName: songId, artist: "Artist", cover: "cover", difficultyCode: 3, typeCode: 1, levelPrecise: 130 });
const played = (songId: string, scoreValue: number, comboStatus: number, syncStatus: number) =>
  ({ ...chart(songId), scoreValue, secondaryScore: 2000, comboStatus, syncStatus, clearStatus: 0 });

beforeEach(() => {
  proxy.reset();
  // The owner's newest snapshot, and the version's charts with that snapshot's scores (none for an unplayed chart).
  proxy.answer(({ table, params }) => {
    if (table === "user_snapshots") return params.includes("owner") ? [snapshot] : [];
    if (table === "songs") return [played("fc", 990000, 1, 0), played("ap", 1005000, 3, 2), chart("unplayed"), played("fdx", 1000500, 0, 4)];
  });
});

it.each([
  ["kiwami", ["unplayed", "fdx"]],
  ["shou", ["fc", "unplayed"]],
  ["shin", ["fc", "unplayed", "fdx"]],
  ["maimai", ["fc", "ap", "unplayed"]],
] as const)("lists the charts still missing the %s plate", async (plateType, missing) => {
  const songs = await fetchPlateSongs("maimai", snapshot, "jp", { version: "12", difficulty: "master", plateType });
  expect(songs.map(song => song.songId)).toEqual(missing);
});

it("returns score codes and reads an unplayed chart as zeros", async () => {
  const songs = await fetchPlateSongs("maimai", snapshot, "jp", { version: "12", difficulty: "master", plateType: "kiwami" });
  expect(songs[0]).toEqual({
    songId: "unplayed", songName: "unplayed", artist: "Artist", cover: "cover", difficultyCode: 3, typeCode: 1, levelPrecise: 130,
    scoreValue: 0, secondaryScore: 0, comboStatus: 0, syncStatus: 0, clearStatus: 0,
  });
  expect(songs[1]).toMatchObject({ scoreValue: 1000500, secondaryScore: 2000, comboStatus: 0, syncStatus: 4 });
  expect(proxy.queries[0].params).toEqual(expect.arrayContaining(["maimai", 41, "jp", 13, 12, 3]));
});

const kiwami = { version: "12", difficulty: "master", plateType: "kiwami" } as const;

it("evaluates the plate against the user's newest snapshot in the region", async () => {
  expect((await fetchLatestPlateSongs("maimai", "owner", "jp", kiwami)).map(song => song.songId)).toEqual(["unplayed", "fdx"]);
  expect(proxy.queries[1].params).toEqual(expect.arrayContaining([41, 13]));
});

it("lists nothing for a user without a snapshot", async () => {
  expect(await fetchLatestPlateSongs("maimai", "stranger", "jp", kiwami)).toEqual([]);
  expect(proxy.queries).toHaveLength(1);
});
