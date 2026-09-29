import { beforeEach, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ tables: {} as Record<string, unknown[][]> }));
vi.mock("@/lib/db", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  return { db: drizzle(async sql => {
    const table = Object.keys(db.tables).find(name => sql.includes(`from "${name}"`));
    return { rows: table ? db.tables[table] : [] };
  }) };
});
vi.mock("@/lib/request-logger", () => ({ getLogger: () => ({ child: () => ({ debug: vi.fn(), warn: vi.fn() }) }) }));

import { buildDailyPlaysMessage, buildExportImageMessage, buildLastCreditMessage } from "./messages";

const snapshotHeader = ["snapshot", "maimai", "Player", 15000, 13, "2026-09-01 00:00:00", "Title", 4, "icon", null, null, null, 1, 2];
const expectedHeader = {
  scale: 2, exp: expect.any(Number), gameVersion: 13, region: "jp", rating: 15000, displayName: "Player",
  iconUrl: "icon", title: "Title", titleType: "rainbow", classRankUrl: "", courseRankUrl: "",
};

beforeEach(() => {
  db.tables = { user: [["player", true]] };
});

it("mints the export image from the snapshot's stored rankings in maimai vocabulary", async () => {
  db.tables.snapshot_rankings = [["abc:j13", "Song", "Artist", "", 3, 1, "13", 130, "Genre", 13, 1005000, 2000, 4, 5, 0, 1]];
  db.tables.user_snapshots = [["owner", "jp", ...snapshotHeader]];
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
  db.tables.user_recent_songs = [["2026-09-01 01:00:00", "abc:j13", 990000, 1500, 1, 2]];
  db.tables.user_snapshots = [snapshotHeader];
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
  const noDetails = Array(34).fill(null);
  const details = [3, 4, 100, 120, null, null, 300, 5, null, ...Array.from({ length: 25 }, (_, index) => index + 1)];
  db.tables.user_recent_songs = [
    ["2026-09-01 01:10:00", "b:j13", 1005000, 2100, 3, 5, 2400, 2, ...noDetails],
    ["2026-09-01 01:05:00", "a:j13", 990000, 1500, 1, 2, 2000, 1, ...details],
    ["2026-09-01 00:50:00", "c:j13", 970000, 1000, 0, 0, 1800, 3, ...noDetails],
  ];
  db.tables.user_snapshots = [snapshotHeader];
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
