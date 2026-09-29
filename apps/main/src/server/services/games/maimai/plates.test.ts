import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ queries: [] as { sql: string; params: unknown[] }[], rows: [] as unknown[][], latest: [] as unknown[][] }));
vi.mock("@/lib/db", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  return { db: drizzle(async (sql, params) => {
    state.queries.push({ sql, params });
    return { rows: sql.includes('from "user_snapshots"') ? state.latest : state.rows };
  }) };
});

import { fetchLatestPlateSongs, fetchPlateSongs } from "./plates";

const snapshot = { id: 41, gameVersion: 13 };

const played = (songId: string, scoreValue: number, comboStatus: number, syncStatus: number) =>
  [songId, songId, "Artist", "cover", 3, 1, 130, scoreValue, 2000, comboStatus, syncStatus, 0];

beforeEach(() => {
  state.queries = [];
  state.rows = [
    played("fc", 990000, 1, 0),
    played("ap", 1005000, 3, 2),
    ["unplayed", "unplayed", "Artist", "cover", 3, 1, 130, null, null, null, null, null],
    played("fdx", 1000500, 0, 4),
  ];
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
  expect(state.queries[0].params).toEqual(expect.arrayContaining(["maimai", 41, "jp", 13, 12, 3]));
});

it("evaluates the plate against the user's newest snapshot in the region, and lists nothing without one", async () => {
  const query = { version: "12", difficulty: "master", plateType: "kiwami" } as const;
  state.latest = [[41, 13]];
  expect((await fetchLatestPlateSongs("maimai", "owner", "jp", query)).map(song => song.songId)).toEqual(["unplayed", "fdx"]);
  const [lookup, plates] = state.queries;
  expect(lookup.sql).toMatch(/order by "user_snapshots"\."fetchedAt" desc limit \$\d+$/);
  expect(lookup.params).toEqual(["maimai", "owner", "jp", 1]);
  expect(plates.params).toEqual(expect.arrayContaining([41, 13]));

  state.queries = [];
  state.latest = [];
  expect(await fetchLatestPlateSongs("maimai", "owner", "jp", query)).toEqual([]);
  expect(state.queries).toHaveLength(1);
});
