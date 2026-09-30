import { beforeEach, expect, it, vi } from "vitest";
import type { ProxyQuery } from "@/test/pg-proxy";

const proxy = await vi.hoisted(async () => (await import("@/test/pg-proxy")).createProxyDb());
const state = vi.hoisted(() => ({ failOn: null as string | null, withoutRankings: false }));
vi.mock("@/lib/db", () => ({ db: proxy.db }));
vi.mock("@/lib/games/registry", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/games/registry")>();
  return { ...actual, getGame: (id: Parameters<typeof actual.getGame>[0]) => {
    const definition = actual.getGame(id);
    return state.withoutRankings ? { ...definition, capabilities: definition.capabilities.filter(capability => capability !== "rankings") } : definition;
  } };
});

import { copySnapshotToVersion } from "./snapshot-copy";

const input = { game: "maimai" as const, userId: "owner", snapshotPublicId: "source", region: "jp" as const, targetVersion: 13 };

const source = {
  id: 1, publicId: "source", userId: "owner", game: "maimai", region: "jp", fetchedAt: "2026-09-01 00:00:00",
  gameVersion: 12, rating: 12000, courseRankUrl: "course.png", classRankUrl: "class.png", stars: 3,
  versionPlayCount: 5, totalPlayCount: 50, iconUrl: "", displayName: "Player", title: "", titleType: 0,
};
const score = { scoreValue: 1005000, secondaryScore: 0, comboStatus: 0, syncStatus: 0, clearStatus: 0 };

// The source snapshot answers only its owner, and each later statement answers what the stored rows would.
function answer({ sql, table, params }: ProxyQuery) {
  if (state.failOn && sql.startsWith(state.failOn)) throw new Error("insert failed");
  const writing = !sql.startsWith("select");
  if (table === "user_snapshots") return writing ? [{ id: 2 }] : params.includes(source.userId) ? [source] : [];
  if (table === "snapshot_scores" && !writing) return [{ parentId: "70", ...score }];
  if (table === "songs") {
    return [{ id: "7", parentId: "70", game: "maimai", level: "14", levelPrecise: 140, region: "jp", gameVersion: 13, addedVersion: 13, songName: "Song", difficulty: 3, type: 0 }];
  }
  if (table === "score_data") return [{ id: 8, songId: "7", ...score }];
}

beforeEach(() => {
  proxy.reset();
  proxy.answer(answer);
  state.failOn = null;
  state.withoutRankings = false;
});

it("returns null without writing when the snapshot is not the user's", async () => {
  await expect(copySnapshotToVersion({ ...input, userId: "someone-else" })).resolves.toBeNull();
  expect(proxy.queries).toHaveLength(1);
  expect(proxy.queries[0].params).toEqual(expect.arrayContaining(["source", "maimai", "someone-else", "jp"]));
});

it("copies scores onto the target charts and rates the copy with the game's player rating", async () => {
  await expect(copySnapshotToVersion(input)).resolves.toEqual({
    newSnapshotId: expect.any(String), copiedScores: 1, totalOriginalScores: 1, originalRating: 12000, newRating: 315,
  });
  expect(proxy.transactions).toEqual(["begin", "commit"]);
  expect(proxy.queries.every(query => query.inTransaction)).toBe(true);
  expect(proxy.inserted("user_snapshots")).toEqual([expect.objectContaining({ game: "maimai", userId: "owner", region: "jp", gameVersion: 13, rating: 12000 })]);
  expect(proxy.inserted("snapshot_rankings")).toEqual([expect.objectContaining({ snapshotId: 2, game: "maimai", scoreId: 8 })]);
  expect(proxy.updated("user_snapshots")).toEqual([{ values: { rating: 315 }, where: [2] }]);
});

it("rolls the whole copy back when a write fails", async () => {
  state.failOn = 'insert into "snapshot_scores"';
  await expect(copySnapshotToVersion(input)).rejects.toThrow('Failed query: insert into "snapshot_scores"');
  expect(proxy.transactions).toEqual(["begin", "rollback"]);
  expect(proxy.queries.every(query => query.inTransaction)).toBe(true);
  expect(proxy.inserted("user_snapshots")).toHaveLength(1);
});

it("keeps the source rating and writes no rankings for a game without rankings", async () => {
  state.withoutRankings = true;
  await expect(copySnapshotToVersion(input)).resolves.toMatchObject({ copiedScores: 1, newRating: 12000 });
  expect(proxy.inserted("snapshot_scores")).toHaveLength(1);
  expect(proxy.inserted("snapshot_rankings")).toEqual([]);
  expect(proxy.updated("user_snapshots")).toEqual([]);
});
