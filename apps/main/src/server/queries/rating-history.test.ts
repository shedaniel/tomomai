import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({ db: {} }));
import { RANKING_BUCKET_CODE } from "@/lib/games/codes";
import { buildRatingHistory } from "./rating-history";

const snapshot = (id: number, date: string, rating: number, gameVersion = 17) => ({ id, fetchedAt: new Date(date), rating, gameVersion });
const score = (snapshotId: number, parentId: bigint, scoreValue: number, bucket: number = RANKING_BUCKET_CODE.new) => ({
  snapshotId, bucket, parentId, scoreValue, songName: `song ${parentId}`, cover: "cover.webp",
  difficultyCode: 4, levelPrecise: 140, comboStatus: 0,
});

describe("rating history", () => {
  it("keeps every fetch but annotates only the last UTC-day fetch", () => {
    const result = buildRatingHistory("chunithm", [
      snapshot(1, "2026-09-01T20:00:00Z", 1500),
      snapshot(2, "2026-09-02T01:00:00Z", 1501),
      snapshot(3, "2026-09-02T20:00:00Z", 1502),
    ], [score(1, BigInt(1), 1000000), score(2, BigInt(1), 1005000), score(3, BigInt(1), 1007500)]);
    expect(result.history.map(entry => entry.rating)).toEqual([1500, 1501, 1502]);
    expect(result.history[1].changes).toEqual([]);
    expect(result.history[2].changes).toEqual([expect.objectContaining({ difficultyCode: 4, oldRating: 1500, newRating: 1600, changeType: "improved" })]);
  });

  it("compares stable chart identity across versions", () => {
    const old = Array.from({ length: 20 }, (_, i) => score(1, BigInt(i + 1), 1000000));
    const current = old.map(entry => ({ ...entry, snapshotId: 2, scoreValue: 1007500 }));
    const result = buildRatingHistory("chunithm", [
      snapshot(1, "2026-09-01T00:00:00Z", 1500),
      snapshot(2, "2026-09-02T00:00:00Z", 1600, 18),
    ], [...old, ...current]);
    expect(result.history[1].changes).toHaveLength(20);
    expect(result.history[1].changes.every(change => change.changeType === "improved")).toBe(true);
  });

  it("annotates the stored selection without selecting it again", () => {
    const stored = (snapshotId: number, scoreValue: number) => Array.from({ length: 20 }, (_, i) =>
      score(snapshotId, BigInt(i + 1), scoreValue, i < 15 ? RANKING_BUCKET_CODE.new : RANKING_BUCKET_CODE.old));
    const result = buildRatingHistory("maimai", [
      snapshot(1, "2026-09-01T00:00:00Z", 14000, 12),
      snapshot(2, "2026-09-02T00:00:00Z", 14500, 12),
    ], [...stored(1, 1000000), ...stored(2, 1005000)]);
    expect(result.history[1].changes).toHaveLength(20);
    expect(result.history[1].changes[0]).toMatchObject({ difficultyCode: 4, oldRating: 302, newRating: 315, changeType: "improved" });
  });

  it("does not invent change annotations for missing rankings or falling ratings", () => {
    const snapshots = [snapshot(1, "2026-09-01T00:00:00Z", 1500), snapshot(2, "2026-09-02T00:00:00Z", 1600)];
    expect(buildRatingHistory("chunithm", snapshots, [score(2, BigInt(1), 1007500)]).history.every(entry => !entry.changes.length)).toBe(true);
    snapshots[1].rating = 1400;
    expect(buildRatingHistory("chunithm", snapshots, [score(1, BigInt(1), 1000000), score(2, BigInt(1), 1007500)]).history[1].changes).toEqual([]);
    expect(buildRatingHistory("chunithm", [], [])).toEqual({ history: [] });
  });
});
