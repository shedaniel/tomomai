import { beforeEach, expect, it, vi } from "vitest";
import type { ProxyRow } from "@/test/pg-proxy";

const proxy = await vi.hoisted(async () => (await import("@/test/pg-proxy")).createProxyDb());
vi.mock("@/lib/db", () => ({ db: proxy.db }));
vi.mock("@/lib/request-logger", () => ({ getLogger: () => ({ child: () => ({ debug: vi.fn(), warn: vi.fn() }) }) }));

import { buildDailyPlaysMessage, buildExportImageMessage, buildLastCreditMessage } from "./messages";

const snapshot = {
  userId: "owner", region: "jp", publicId: "snapshot", game: "maimai", displayName: "Player", rating: 15000, gameVersion: 13,
  fetchedAt: "2026-09-01 00:00:00", title: "Title", titleType: 4, iconUrl: "icon", courseRankUrl: null, classRankUrl: null, stars: null,
  versionPlayCount: 1, totalPlayCount: 2,
};
const expectedHeader = {
  scale: 2, exp: expect.any(Number), gameVersion: 13, region: "jp", rating: 15000, displayName: "Player",
  iconUrl: "icon", title: "Title", titleType: "rainbow", classRankUrl: "", courseRankUrl: "",
};

let tables: Record<string, ProxyRow[]>;
beforeEach(() => {
  proxy.reset();
  tables = { user: [{ username: "player", publishProfile: true }], user_snapshots: [snapshot] };
  proxy.answer(({ table }) => table ? tables[table] : undefined);
});

it("mints the export image from the snapshot's stored rankings in maimai vocabulary", async () => {
  tables.snapshot_rankings = [{
    songId: "abc:j13", songName: "Song", artist: "Artist", cover: "", difficultyCode: 3, typeCode: 1, level: "13", levelPrecise: 130, genre: "Genre",
    addedVersion: 13, scoreValue: 1005000, secondaryScore: 2000, comboStatus: 4, syncStatus: 5, clearStatus: 0, bucket: 1,
  }];
  const result = await buildExportImageMessage({ snapshotId: "snapshot", scale: 2 });
  expect(result).toEqual({
    ok: true,
    message: {
      route: "export-image",
      header: expectedHeader,
      payload: { visitableProfileAt: "player", charts: [{ songId: "abc:j13", achievement: 1005000, fc: "ap+", fs: "fdx+" }] },
    },
  });
});

it("mints a day's plays with the header of the snapshot before it", async () => {
  tables.user_recent_songs = [{ playedAt: "2026-09-01 01:00:00", songId: "abc:j13", scoreValue: 990000, secondaryScore: 1500, comboStatus: 1, syncStatus: 2 }];
  const result = await buildDailyPlaysMessage({ userId: "owner", region: "jp", day: "2026-09-01", scale: 2 });
  expect(result).toEqual({
    ok: true,
    message: {
      route: "daily-plays",
      header: expectedHeader,
      payload: { day: "2026-09-01", plays: [{ songId: "abc:j13", achievement: 990000, fc: "fc", fs: "fs" }] },
    },
  });
});

it("mints the latest credit's tracks in play order with their judgement details", async () => {
  const counts = (kind: string, first: number) => ({
    [`${kind}CPerfect`]: first, [`${kind}Perfect`]: first + 1, [`${kind}Great`]: first + 2, [`${kind}Good`]: first + 3, [`${kind}Miss`]: first + 4,
  });
  const playlog = {
    fastCount: 3, lateCount: 4, combo: 100, maxCombo: 120, syncScore: null, maxSyncScore: null, venue: null, rating: 300, ratingChange: 5,
    ...counts("tap", 1), ...counts("hold", 6), ...counts("slide", 11), ...counts("touch", 16), ...counts("break", 21),
  };
  const play = (playedAt: string, songId: string, scoreValue: number, secondaryScore: number, comboStatus: number, syncStatus: number, maxDxScore: number, track: number) =>
    ({ playedAt, songId, scoreValue, secondaryScore, comboStatus, syncStatus, maxDxScore, track, playlog: null });
  tables.user_recent_songs = [
    play("2026-09-01 01:10:00", "b:j13", 1005000, 2100, 3, 5, 2400, 2),
    { ...play("2026-09-01 01:05:00", "a:j13", 990000, 1500, 1, 2, 2000, 1), playlog },
    play("2026-09-01 00:50:00", "c:j13", 970000, 1000, 0, 0, 1800, 3),
  ];
  const result = await buildLastCreditMessage({ userId: "owner", region: "jp", scale: 2 });
  const judgements = (first: number) => ({ criticalPerfect: first, perfect: first + 1, great: first + 2, good: first + 3, miss: first + 4 });
  expect(result).toEqual({
    ok: true,
    message: {
      route: "last-credit",
      header: expectedHeader,
      payload: {
        playedAt: Date.parse("2026-09-01T01:05:00Z") / 1000,
        tracks: [
          {
            songId: "a:j13", achievement: 990000, fc: "fc", fs: "fs", dxScore: 1500, maxDxScore: 2000,
            details: { fastCount: 3, lateCount: 4, tap: judgements(1), hold: judgements(6), slide: judgements(11), touch: judgements(16), break: judgements(21) },
          },
          { songId: "b:j13", achievement: 1005000, fc: "ap", fs: "fdx+", dxScore: 2100, maxDxScore: 2400, details: null },
        ],
      },
    },
  });
});
