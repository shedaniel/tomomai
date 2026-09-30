import { beforeEach, describe, expect, it, vi } from "vitest";

const proxy = await vi.hoisted(async () => (await import("@/test/pg-proxy")).createProxyDb());
const state = vi.hoisted(() => ({ withoutRankings: false, warn: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: proxy.db }));
vi.mock("@/lib/request-logger", () => ({ getLogger: () => ({ warn: state.warn }) }));
vi.mock("@/lib/games/registry", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/games/registry")>();
  return { ...actual, getGame: (id: Parameters<typeof actual.getGame>[0]) => {
    const definition = actual.getGame(id);
    return state.withoutRankings ? { ...definition, capabilities: definition.capabilities.filter(capability => capability !== "rankings") } : definition;
  } };
});
import { db } from "@/lib/db";
import { RANKING_BUCKET_CODE } from "@/lib/games/codes";
import { buildChartResolution, writeSnapshotScores, type DbSong } from "./score-storage";

beforeEach(() => { proxy.reset(); state.withoutRankings = false; state.warn.mockClear(); });

function song(id: number, songName: string, difficulty = 3) {
  return {
    id: String(id), parentId: String(id), game: "maimai", level: "14", levelPrecise: 140, region: "jp", gameVersion: 14, addedVersion: 14,
    songName, difficulty, type: 0,
  };
}

it("excludes every ambiguous chart while keeping distinct difficulties and the original rows", async () => {
  proxy.respond([song(1, "Shared"), song(2, "Shared"), song(3, "Shared"), song(4, "Shared", 2)]);
  const { chartResolution, songsById } = await buildChartResolution(db, "maimai", "jp", 14);
  expect(chartResolution.has("Shared|3|0")).toBe(false);
  expect(chartResolution.get("Shared|2|0")).toBe(BigInt(4));
  expect(songsById.size).toBe(4);
  expect(state.warn).toHaveBeenCalledExactlyOnceWith(
    { songKeys: ["Shared|3|0"], game: "maimai", region: "jp", version: 14 },
    "Ambiguous song names excluded from score lookup",
  );
});

it.each(["maimai", "chunithm"] as const)("looks charts up only in the %s catalog of the region and captured version", async game => {
  await buildChartResolution(db, game, "jp", 14);
  expect(proxy.queries.map(({ table, params }) => [table, params])).toEqual([["songs", [game, "jp", 14]]]);
  expect(state.warn).not.toHaveBeenCalled();
});

function snapshotScore(songId: number, addedVersion: number, scoreValue: number) {
  const song = { id: BigInt(songId), addedVersion, levelPrecise: 140, difficulty: 3 } as DbSong;
  return { song, values: { songId: song.id, scoreValue, secondaryScore: 0, comboStatus: 0, syncStatus: 0, clearStatus: 0 } };
}

describe("writeSnapshotScores", () => {
  const scores = [
    snapshotScore(2, 8, 1000000),
    snapshotScore(1, 9, 1009000),
    snapshotScore(1, 9, 1009000),
    snapshotScore(3, 9, 1007500),
    snapshotScore(4, 8, 0),
  ];
  const stored = (id: number, songId: string, scoreValue: number) => ({ id, songId, scoreValue, secondaryScore: 0, comboStatus: 0, syncStatus: 0, clearStatus: 0 });
  const storedRows = [stored(31, "1", 1009000), stored(32, "2", 1000000), stored(33, "3", 1007500), stored(34, "4", 0)];
  const input = { game: "chunithm" as const, snapshotId: 5, gameVersion: 9, scores };

  it("upserts each distinct score once in lock order and links it once, zero values included", async () => {
    proxy.respond(storedRows);
    await writeSnapshotScores(db, input);
    const upserted = (songId: number, scoreValue: number) =>
      ({ game: "chunithm", songId: BigInt(songId), scoreValue, secondaryScore: 0, comboStatus: 0, syncStatus: 0, clearStatus: 0 });
    expect(proxy.inserted("score_data")).toEqual([upserted(1, 1009000), upserted(2, 1000000), upserted(3, 1007500), upserted(4, 0)]);
    // One stored row per distinct score is what lets a later snapshot reuse it.
    expect(proxy.queries[0].sql).toContain('on conflict ("songId","scoreValue","secondaryScore","comboStatus","syncStatus","clearStatus")');
    expect(proxy.inserted("snapshot_scores")).toEqual([32, 31, 33, 34].map(scoreId => ({ game: "chunithm", snapshotId: 5, scoreId })));
  });

  it("ranks the stored scores into the game's buckets, numbering each from zero", async () => {
    proxy.respond(storedRows);
    const ranking = await writeSnapshotScores(db, input);
    expect(ranking?.newScores.map(score => [score.scoreId, score.rating])).toEqual([[31, 1615], [33, 1600]]);
    expect(ranking?.oldScores.map(score => [score.scoreId, score.rating])).toEqual([[32, 1500], [34, 0]]);
    expect(proxy.inserted("snapshot_rankings")).toEqual([
      { game: "chunithm", snapshotId: 5, bucket: RANKING_BUCKET_CODE.new, rank: 0, scoreId: 31 },
      { game: "chunithm", snapshotId: 5, bucket: RANKING_BUCKET_CODE.new, rank: 1, scoreId: 33 },
      { game: "chunithm", snapshotId: 5, bucket: RANKING_BUCKET_CODE.old, rank: 0, scoreId: 32 },
      { game: "chunithm", snapshotId: 5, bucket: RANKING_BUCKET_CODE.old, rank: 1, scoreId: 34 },
    ]);
  });

  it("stores scores without rankings for a game that has none", async () => {
    state.withoutRankings = true;
    proxy.respond(storedRows);
    await expect(writeSnapshotScores(db, input)).resolves.toBeNull();
    expect(proxy.inserted("snapshot_scores")).toHaveLength(4);
    expect(proxy.inserted("snapshot_rankings")).toEqual([]);
  });

  it("ranks nothing when no score was stored", async () => {
    await expect(writeSnapshotScores(db, { ...input, scores: [] })).resolves.toBeNull();
    expect(proxy.inserted("snapshot_rankings")).toEqual([]);
  });
});
