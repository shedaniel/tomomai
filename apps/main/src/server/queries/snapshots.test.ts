import { beforeEach, expect, it, vi } from "vitest";
import { RANKING_BUCKET_CODE } from "@/lib/games/codes";
import type { ProxyQuery } from "@/test/pg-proxy";

const proxy = await vi.hoisted(async () => (await import("@/test/pg-proxy")).createProxyDb());
vi.mock("@/lib/db", () => ({ db: proxy.db }));
vi.mock("@/lib/r2", () => ({ deleteFromR2: vi.fn(), isR2IconUrl: () => false, r2KeyFromIconUrl: vi.fn() }));
vi.mock("@/lib/request-logger", () => ({ getLogger: () => ({ info: vi.fn(), warn: vi.fn() }) }));

import { fetchLatestSnapshotData, fetchSnapshotData, fetchSnapshotDataByPublicId, fetchSnapshotRankings } from "./snapshots";

const INTERNAL_ID = 41;
const storedSnapshot = {
  id: INTERNAL_ID, publicId: "snapshot", userId: "owner", game: "chunithm", region: "jp", fetchedAt: "2026-09-01 00:00:00",
  gameVersion: 9, rating: 1700, courseRankUrl: null, classRankUrl: null, stars: null, versionPlayCount: 1, totalPlayCount: 2,
  iconUrl: "", displayName: "Player", title: "Title", titleType: 0,
};
const storedEvent = {
  snapshotId: INTERNAL_ID, eventType: "area", name: "Map progress", currentDistance: 10, nextRewardDistance: null,
  state: "in_progress", imageUrl: "https://example.com/map.png", eventPeriodStart: null, eventPeriodEnd: null,
};
const score = {
  songId: "Ab3xK9pQ:j9", songName: "Song", artist: "Artist", cover: "", difficultyCode: 4, typeCode: 0, level: "14+", levelPrecise: 145,
  genre: "Original", addedVersion: 9, scoreValue: 1009000, secondaryScore: 0, comboStatus: 3, syncStatus: 0, clearStatus: 1,
};

// A snapshot row answers only a query that names its owner and game, and its children only its internal id.
const ownedBy = ({ params }: ProxyQuery, row: typeof storedSnapshot) => params.includes(row.userId) && params.includes(row.game);
beforeEach(() => {
  proxy.reset();
  proxy.answer(query => {
    if (query.table === "user_snapshots") return ownedBy(query, storedSnapshot) ? [storedSnapshot] : [];
    if (query.table === "snapshot_scores") return query.params.includes(INTERNAL_ID) ? [score] : [];
    if (query.table === "user_events") return query.params.includes(INTERNAL_ID) ? [storedEvent] : [];
    if (query.table === "snapshot_rankings") {
      return ownedBy(query, storedSnapshot) && query.params.includes(storedSnapshot.publicId) ? [{ ...score, bucket: RANKING_BUCKET_CODE.new }] : [];
    }
  });
});

it.each([
  ["by public id", () => fetchSnapshotData("chunithm", "owner", "snapshot", "jp")],
  ["latest", () => fetchLatestSnapshotData("chunithm", "owner", "jp")],
])("reads the %s snapshot with its scores and events, without handing out the internal id or owner", async (_, read) => {
  const result = await read();
  expect(result?.snapshot).toStrictEqual({
    publicId: "snapshot", game: "chunithm", displayName: "Player", rating: 1700, gameVersion: 9, fetchedAt: new Date("2026-09-01T00:00:00Z"),
    title: "Title", titleType: 0, iconUrl: "", courseRankUrl: null, classRankUrl: null, stars: null, versionPlayCount: 1, totalPlayCount: 2,
  });
  expect(result?.events).toStrictEqual([{
    eventType: "area", name: "Map progress", currentDistance: 10, nextRewardDistance: null, state: "in_progress",
    imageUrl: "https://example.com/map.png", eventPeriodStart: null, eventPeriodEnd: null,
  }]);
  expect(result?.songs).toStrictEqual([score]);
});

it.each([
  ["another owner", () => fetchSnapshotData("chunithm", "stranger", "snapshot", "jp")],
  ["another game", () => fetchSnapshotData("maimai", "owner", "snapshot", "jp")],
  ["another owner's latest", () => fetchLatestSnapshotData("chunithm", "stranger", "jp")],
])("reads nothing of %s", async (_, read) => {
  await expect(read()).resolves.toBeNull();
  expect(proxy.queries.map(query => query.table)).toEqual(["user_snapshots"]);
});

it("reads the owner's snapshot by public id in whichever region it was fetched, and nothing of another owner or game", async () => {
  const result = await fetchSnapshotDataByPublicId("chunithm", "owner", "snapshot");
  expect(result).toMatchObject({ region: "jp", snapshot: { publicId: "snapshot", game: "chunithm" } });
  expect(result?.songs).toHaveLength(1);
  expect(result?.snapshot).not.toHaveProperty("region");
  await expect(fetchSnapshotDataByPublicId("chunithm", "stranger", "snapshot")).resolves.toBeNull();
  await expect(fetchSnapshotDataByPublicId("maimai", "owner", "snapshot")).resolves.toBeNull();
});

it("reads stored rankings only through the owner's snapshot", async () => {
  const owned = await fetchSnapshotRankings("chunithm", "owner", { publicId: "snapshot", gameVersion: 9 });
  expect(owned.newScores.map(song => song.songId)).toEqual(["Ab3xK9pQ:j9"]);
  const stranger = await fetchSnapshotRankings("chunithm", "stranger", { publicId: "snapshot", gameVersion: 9 });
  expect([...stranger.newScores, ...stranger.oldScores]).toEqual([]);
  const otherGame = await fetchSnapshotRankings("maimai", "owner", { publicId: "snapshot", gameVersion: 9 });
  expect([...otherGame.newScores, ...otherGame.oldScores]).toEqual([]);
});
