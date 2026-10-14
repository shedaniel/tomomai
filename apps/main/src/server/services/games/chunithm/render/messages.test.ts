import { beforeEach, expect, it, vi } from "vitest";
import type { ProxyRow } from "@/test/pg-proxy";

const proxy = await vi.hoisted(async () => (await import("@/test/pg-proxy")).createProxyDb());
vi.mock("@/lib/db", () => ({ db: proxy.db }));

import { buildDailyPlaysMessage, buildExportImageMessage } from "./messages";

const snapshot = {
  userId: "owner", region: "jp", publicId: "snapshot", game: "chunithm", displayName: "PLAYER", rating: 1725, gameVersion: 9,
  fetchedAt: "2026-09-01 00:00:00", title: "Title", titleType: 0, iconUrl: "icon", courseRankUrl: null, classRankUrl: null, stars: null,
  versionPlayCount: 1, totalPlayCount: 2,
};
const expectedHeader = { scale: 2, exp: expect.any(Number), gameVersion: 9, region: "jp", rating: 1725, displayName: "PLAYER", iconUrl: "icon", title: "Title" };

let tables: Record<string, ProxyRow[]>;
beforeEach(() => {
  proxy.reset();
  tables = { user: [{ username: "player", publishProfile: true }], user_snapshots: [snapshot] };
  proxy.answer(({ table }) => table ? tables[table] : undefined);
});

it("mints the rating breakdown from the snapshot's stored rankings with each chart's rating", async () => {
  const ranked = (songId: string, scoreValue: number, levelPrecise: number, bucket: number) => ({
    songId, songName: "Song", artist: "Artist", cover: "", difficultyCode: 3, typeCode: 0, level: "14", levelPrecise, genre: "Genre",
    addedVersion: 9, scoreValue, secondaryScore: 0, comboStatus: 2, syncStatus: 1, clearStatus: 3, bucket,
  });
  tables.snapshot_rankings = [ranked("Ab3xK9pQ:j9", 1_009_000, 145, 1), ranked("Zz_-0123:j9", 1_007_500, 140, 2)];

  const result = await buildExportImageMessage({ snapshotId: "snapshot", scale: 2 });

  expect(proxy.queries[0].params).toEqual(expect.arrayContaining(["chunithm", "snapshot"]));
  expect(result).toEqual({
    ok: true,
    message: {
      game: "chunithm",
      route: "export-image",
      header: expectedHeader,
      payload: {
        visitableProfileAt: "player",
        newCharts: [{ songId: "Ab3xK9pQ:j9", scoreValue: 1_009_000, comboStatus: 2, syncStatus: 1, clearStatus: 3, rating: 1665 }],
        oldCharts: [{ songId: "Zz_-0123:j9", scoreValue: 1_007_500, comboStatus: 2, syncStatus: 1, clearStatus: 3, rating: 1600 }],
      },
    },
  });
});

it("answers 404 for a snapshot it cannot find", async () => {
  tables.user_snapshots = [];
  await expect(buildExportImageMessage({ snapshotId: "missing", scale: 2 })).resolves.toEqual({ ok: false, status: 404, error: "Snapshot not found" });
});

it("mints a day's plays rated by their charts", async () => {
  tables.user_recent_songs = [{
    playedAt: "2026-09-01 01:00:00", songId: "Ab3xK9pQ:j9", scoreValue: 1_005_000, secondaryScore: 0,
    comboStatus: 1, syncStatus: 0, clearStatus: 1, levelPrecise: 130, difficultyCode: 3,
  }];

  const result = await buildDailyPlaysMessage({ userId: "owner", region: "jp", day: "2026-09-01", scale: 2 });

  expect(result).toEqual({
    ok: true,
    message: {
      game: "chunithm",
      route: "daily-plays",
      header: expectedHeader,
      payload: { day: "2026-09-01", plays: [{ songId: "Ab3xK9pQ:j9", scoreValue: 1_005_000, comboStatus: 1, syncStatus: 0, clearStatus: 1, rating: 1450 }] },
    },
  });
});
