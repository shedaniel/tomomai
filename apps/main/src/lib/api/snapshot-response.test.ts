import { beforeEach, expect, it, vi } from "vitest";
import type { ApiKeyInfo } from "@/lib/api/protect";
import type { userSnapshots } from "@/lib/db/schema-pg";

vi.mock("@/lib/api/protect", () => ({
  keyHasScope: (key: ApiKeyInfo, scope: string) => key.permissions[scope]?.includes("access") ?? false,
}));
const queries = vi.hoisted(() => ({ fetchSnapshotRankings: vi.fn() }));
vi.mock("@/server/queries/snapshots", () => queries);

import { buildSnapshotPayload } from "./snapshot-response";

const snapshot: typeof userSnapshots.$inferSelect = {
  metadata: null, id: 7, publicId: "snapshot", userId: "owner", game: "maimai", region: "jp", fetchedAt: new Date("2026-09-01T00:00:00Z"),
  gameVersion: 13, rating: 15000, courseRankUrl: null, classRankUrl: null, stars: null, versionPlayCount: 1, totalPlayCount: 2,
  iconUrl: "", displayName: "Player", title: "", titleType: 0,
};
type StoredScore = Parameters<typeof buildSnapshotPayload>[0]["songs"][number];
const score = (songId: string, scoreValue: number): StoredScore => ({
  songId, songName: songId, artist: "", cover: "", genre: "", level: "14", levelPrecise: 140, addedVersion: 13,
  difficultyCode: 3, typeCode: 1, scoreValue, secondaryScore: 0, comboStatus: 0, syncStatus: 0, clearStatus: 0,
});
const data = { snapshot, songs: [score("unranked", 1010000), score("new", 1005000), score("old", 1000000)], events: [] };
const key = (...scopes: string[]): ApiKeyInfo => ({
  userId: "owner", keyId: "key", name: null, expiresAt: null,
  permissions: Object.fromEntries(scopes.map(scope => [scope, ["access"]])),
});

beforeEach(() => vi.clearAllMocks());

it("serves the B50 scope from the rankings stored with the snapshot", async () => {
  queries.fetchSnapshotRankings.mockResolvedValue({ newScores: [{ ...score("new", 1005000), rating: 315 }], oldScores: [{ ...score("old", 1000000), rating: 302 }] });
  const payload = await buildSnapshotPayload(data, key("snapshot:all:songs:b50:read"), "all");
  expect(queries.fetchSnapshotRankings).toHaveBeenCalledWith("maimai", snapshot);
  expect(payload.songs?.map(song => [song.songId, song.rating])).toEqual([["new", 315], ["old", 302]]);
});

it("returns every score without reading rankings under the full songs scope", async () => {
  const payload = await buildSnapshotPayload(data, key("snapshot:all:songs:read", "snapshot:all:songs:b50:read"), "all");
  expect(payload.songs?.map(song => song.songId)).toEqual(["unranked", "new", "old"]);
  expect(payload.songs?.[0]).not.toHaveProperty("rating");
  expect(queries.fetchSnapshotRankings).not.toHaveBeenCalled();
});
