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

import { buildDailyPlaysMessage, buildExportImageMessage } from "./messages";

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
