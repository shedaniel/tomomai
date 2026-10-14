import { beforeEach, expect, it, vi } from "vitest";

const proxy = await vi.hoisted(async () => (await import("@/test/pg-proxy")).createProxyDb());
vi.mock("@/lib/db", () => ({ db: proxy.db }));
vi.mock("@/lib/request-logger", () => ({ getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }));

import type { GameSiteClient } from "@/server/services/games/sega/http";
import type { RecentSongData } from "../types";
import { fetchAndInsertRecentSongsData } from "./details";

const PLAYED_AT = "2026-09-01 12:34:00";
const play: RecentSongData = {
  songName: "Song", level: "13", musicType: "dx", difficulty: "master", achievement: 1_005_000, dxScore: 100, maxDxScore: 200,
  fc: "ap", fs: "none", track: 1, playedAt: new Date("2026-09-01T12:34:00Z"), idx: "7",
};
const DETAIL_PAGE = `
  <div class="playlog_score_block"><div class="white">100</div><div class="white">120/150</div><div class="white">10/20</div></div>
  <div class="playlog_notes_detail"><table>
    <tr><th>CRITICAL</th></tr>
    <tr><td>90</td><td>5</td><td>1</td><td>0</td><td>0</td></tr>
  </table></div>`;

const site: GameSiteClient = {
  pageUrl: "https://maimaidx.jp/maimai-mobile/",
  html: async () => DETAIL_PAGE,
  post: async () => "",
  bytes: async () => { throw new Error("No bytes in this test"); },
};

// The same player has a CHUNITHM play in the same minute, which must not receive the maimai detail.
const storedPlays = [
  { id: "11", userId: "player", game: "maimai", playedAt: PLAYED_AT },
  { id: "12", userId: "player", game: "chunithm", playedAt: PLAYED_AT },
];

beforeEach(() => {
  proxy.reset();
  proxy.answer(({ table, params }) => table === "user_recent_songs"
    ? storedPlays.filter(row => params.includes(row.game) && params.includes(row.userId))
    : []);
});

it("saves a play's detail against the player's maimai play only", async () => {
  await fetchAndInsertRecentSongsData("player", "jp", site, [play]);

  expect(proxy.inserted("user_recent_songs_detailed")).toEqual([
    expect.objectContaining({ recentSongId: BigInt(11), combo: 120, maxCombo: 150, syncScore: 10, maxSyncScore: 20, tapCPerfect: 90 }),
  ]);
});

it("fetches nothing for a play whose detail is already saved", async () => {
  proxy.answer(({ table }) => table === "user_recent_songs_detailed" ? [{ playedAt: PLAYED_AT }] : []);

  await fetchAndInsertRecentSongsData("player", "jp", site, [play]);

  expect(proxy.queries).toHaveLength(1);
});
